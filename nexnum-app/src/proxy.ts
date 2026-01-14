import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { rateLimiters } from '@/lib/auth/ratelimit'
import { redis } from '@/lib/core/redis'

// In-memory cache for settings to reduce Redis hits
let settingsCache: { data: string, timestamp: number } | null = null
const SETTINGS_CACHE_TTL = 60000 // 60 seconds

export default async function proxy(request: NextRequest) {
    const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1'
    const { pathname } = request.nextUrl

    // -------------------------------------------------------------
    // 1. Security Headers (Production Grade)
    // -------------------------------------------------------------
    const headers = new Headers(request.headers)
    const response = NextResponse.next({
        request: {
            headers,
        },
    })

    response.headers.set('X-DNS-Prefetch-Control', 'on')
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'origin-when-cross-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

    // Content Security Policy (Production-Grade)
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io https://*.vercel-insights.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https: http:",
        "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io wss: https:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ')
    response.headers.set('Content-Security-Policy', csp)

    // Request Tracing Headers (Professional Observability)
    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    response.headers.set('X-Request-ID', requestId)

    // -------------------------------------------------------------
    // 1.5 Maintenance Mode Check
    // -------------------------------------------------------------
    // Skip for static assets
    if (!pathname.startsWith('/_next') && !pathname.includes('.')) {
        try {
            // Check maintenance mode from Redis (fast edge read of settings)
            // We use local caching to avoid hitting Redis on every request
            let settingsData: string | null = null
            const now = Date.now()

            if (settingsCache && (now - settingsCache.timestamp < SETTINGS_CACHE_TTL)) {
                settingsData = settingsCache.data
            } else {
                settingsData = await redis.get('app:settings') as string | null
                if (settingsData) {
                    settingsCache = { data: settingsData, timestamp: now }
                }
            }

            if (settingsData) {
                const settings = typeof settingsData === 'string' ? JSON.parse(settingsData) : settingsData
                const isMaintenance = settings?.general?.maintenanceMode

                // Allow list for maintenance mode
                const isAllowedPath =
                    pathname.startsWith('/admin') ||
                    pathname.startsWith('/api/admin') ||
                    pathname.startsWith('/login') ||
                    pathname.startsWith('/api/auth') ||
                    pathname === '/maintenance'

                if (isMaintenance && !isAllowedPath) {
                    return NextResponse.redirect(new URL('/maintenance', request.url))
                }

                if (!isMaintenance && pathname === '/maintenance') {
                    return NextResponse.redirect(new URL('/', request.url))
                }
            }
        } catch (e) {
            // If checking settings fails, proceed normally (fail open)
            console.error('Middleware settings check failed:', e)
        }
    }

    // -------------------------------------------------------------
    // 2. Rate Limiting Strategy
    // -------------------------------------------------------------
    // Exclude static assets/internal routes from rate limiting
    if (!pathname.startsWith('/_next') && !pathname.includes('.')) {
        let success = true

        try {
            // Strict limiting for Auth routes
            if (pathname.startsWith('/api/auth')) {
                const result = await rateLimiters.auth.limit(ip)
                success = result.success
                response.headers.set('X-RateLimit-Limit', result.limit.toString())
                response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
            }
            // Strict limiting for Transactions (Buy/SMS)
            else if (pathname.startsWith('/api/sms') || pathname.startsWith('/api/wallet')) {
                const result = await rateLimiters.transaction.limit(ip)
                success = result.success
            }
            // Admin API limiting (stricter)
            else if (pathname.startsWith('/api/admin')) {
                const result = await rateLimiters.admin.limit(ip)
                success = result.success
                response.headers.set('X-RateLimit-Limit', result.limit.toString())
                response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
            }
            // General API limiting
            else if (pathname.startsWith('/api')) {
                const result = await rateLimiters.api.limit(ip)
                success = result.success
            }
        } catch (error) {
            // "Fail open" if rate limiting service is down or limit is hit
            console.error('[RateLimit Error] Failing open:', error)
            success = true
        }

        if (!success) {
            return new NextResponse(JSON.stringify({ error: 'Too Many Requests' }), {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'X-RateLimit-Reset': '1', // Hint to client
                }
            })
        }
    }

    // -------------------------------------------------------------
    // 3. Admin & Protected Route Guards
    // -------------------------------------------------------------
    if (pathname.startsWith('/admin')) {
        const token = request.cookies.get('token')?.value

        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url))
        }

        try {
            const payload = await verifyToken(token)
            if (!payload || payload.role !== 'ADMIN') {
                console.warn(`[Security] Unauthorized Admin Access Attempt: ${ip}`)
                return NextResponse.redirect(new URL('/dashboard', request.url))
            }
        } catch (error) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    }

    if (pathname.startsWith('/dashboard')) {
        const token = request.cookies.get('token')?.value
        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url))
        }

        // Optional: Verify token existence for dashboard (stateless check)
        // For deep verification, we rely on the API routes/layout to fetch user data
    }

    return response
}

export const config = {
    // Apply to all routes except static assets
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
