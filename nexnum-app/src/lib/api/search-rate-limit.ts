import { NextRequest, NextResponse } from 'next/server'
import { rateLimiters } from '@/lib/auth/ratelimit'
import { ResponseFactory } from '@/lib/api/response-factory'
import { AuthGuard } from '@/lib/auth/guard'
import { logger } from '@/lib/core/logger'

/**
 * Search-Specific Rate Limiter (per-user, per-IP fallback).
 *
 * Why a separate limiter: search routes are public by design, but they hit the
 * same Postgres + MeiliSearch + Redis backend as protected routes. Without
 * limits, a single client (or scraper) can:
 *   1. Fire 100s of req/sec on /api/search/services
 *   2. Each req fans out to ~24 Prisma icon lookups
 *   3. Worker thread maxes out, legit users see >1s response times
 *
 * Strategy:
 *   - Authenticated user → 60 req/min (per userId, allows 1 req/sec sustained)
 *   - Anonymous         → 30 req/min (per client IP, half because no accountability)
 *
 * Both buckets are sliding-window via Redis (Lua script, see lib/auth/ratelimit.ts).
 * Fail-open: if Redis is down, the request is allowed and the failure is logged.
 */

const SEARCH_USER_LIMIT = 60
const SEARCH_IP_LIMIT = 30
const WINDOW_SECONDS = 60

function getClientIp(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    const realIp = request.headers.get('x-real-ip')
    if (realIp) return realIp
    return 'unknown'
}

function attachRateLimitHeaders(
    res: NextResponse,
    result: { limit: number; remaining: number; reset: number }
) {
    res.headers.set('X-RateLimit-Limit', String(result.limit))
    res.headers.set('X-RateLimit-Remaining', String(result.remaining))
    res.headers.set('X-RateLimit-Reset', String(result.reset))
    res.headers.set('Retry-After', String(Math.ceil((result.reset - Date.now()) / 1000)))
    return res
}

export interface SearchRateLimitResult {
    success: boolean
    response?: NextResponse
    userId?: string
    ip: string
}

/**
 * Apply rate limit to a search route. Call at the top of the route handler.
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *       const rl = await checkSearchRateLimit(req)
 *       if (!rl.success) return rl.response!
 *       // ... rest of handler
 *   }
 */
export async function checkSearchRateLimit(request: NextRequest): Promise<SearchRateLimitResult> {
    const ip = getClientIp(request)

    // Try to identify the user (no error if anonymous)
    const user = await AuthGuard.tryUser()
    const isAuthed = !!user

    // Select the right bucket
    const identifier = isAuthed ? `user:${user!.userId}` : `ip:${ip}`
    const limit = isAuthed ? SEARCH_USER_LIMIT : SEARCH_IP_LIMIT

    // We use the `api` limiter (already configured with a 60s window)
    // and pass a custom limit via the second arg of `.limit()`
    const result = await rateLimiters.api.limit(identifier, limit)

    if (!result.success) {
        logger.warn('Search rate limit exceeded', {
            context: 'SEARCH_RL',
            identifier,
            ip,
            userId: user?.userId,
            limit,
            windowSeconds: WINDOW_SECONDS
        })
        const err = ResponseFactory.error(
            `Rate limit exceeded. Try again in ${Math.ceil((result.reset - Date.now()) / 1000)}s.`,
            429,
            'E_RATE_LIMIT_EXCEEDED'
        )
        attachRateLimitHeaders(err, { limit, remaining: 0, reset: result.reset })
        return { success: false, response: err, ip }
    }

    return { success: true, userId: user?.userId, ip }
}

/**
 * Attach rate-limit headers to a successful response. Call this on the final
 * NextResponse before returning it from the route handler.
 */
export function withRateLimitHeaders(
    response: NextResponse,
    userId: string | undefined,
    ip: string
): NextResponse {
    const isAuthed = !!userId
    const identifier = isAuthed ? `user:${userId}` : `ip:${ip}`
    const limit = isAuthed ? SEARCH_USER_LIMIT : SEARCH_IP_LIMIT

    // We can't easily get `remaining` without re-running the limiter,
    // so we set conservative headers. The limiter sets them on 429.
    response.headers.set('X-RateLimit-Limit', String(limit))
    response.headers.set('X-RateLimit-Policy', `${limit};w=${WINDOW_SECONDS}`)
    return response
}
