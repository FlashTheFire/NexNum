import { NextResponse } from 'next/server'
import { ZodError, ZodSchema } from 'zod'
import { logger } from '@/lib/core/logger'
import { AuthGuard } from '@/lib/auth/guard'
import { rateLimiters, RatelimitType } from '@/lib/auth/ratelimit'
import { runSecurityChecks, SecurityOptions, createSecurityErrorResponse, API_SECURITY_HEADERS } from '@/lib/security'
import { ResponseFactory } from './response-factory'
import { withRequestContext, generateRequestId } from '@/lib/api/request-context'

type ApiHandler<T> = (
    req: Request,
    context: {
        params?: Promise<any> | any;
        body?: T;
        user?: { userId: string; role?: string };
        security?: { fingerprint?: string; clientIp?: string }
    }
) => Promise<NextResponse>

interface ApiOptions<T> {
    schema?: ZodSchema<T>
    roles?: string[] // Future: Role Based Access Control
    rateLimit?: RatelimitType // Rate limit type: 'api' | 'auth' | 'admin' | 'transaction'
    requiresAuth?: boolean // If true, injects user into context using requireUser()

    // Security options
    security?: SecurityOptions | boolean // false to disable, object to customize
}

/**
 * Professional API Wrapper with Security
 * - Security Checks (CSRF, Origin, Browser, Fingerprint)
 * - Rate Limiting (P0 Security)
 * - Standardizes Error Handling
 * - Handles Zod Validation
 * - Logs Requests/Errors properly
 */

export function apiHandler<T = any>(
    handler: ApiHandler<T>,
    options: ApiOptions<T> = {}
) {
    return async (req: Request, context?: { params?: Promise<any> | any }) => {
        const requestId = req.headers.get('X-Request-ID') || generateRequestId()
        const traceId = req.headers.get('X-Trace-ID') || requestId

        return withRequestContext({ requestId, traceId }, async () => {
            try {
                // 0. Logging Request
                const url = new URL(req.url)
                const label = url.pathname.startsWith('/api') ? 'API' : 'APP'
                logger.request(label, req.method, url.pathname)

                // 1. SECURITY LAYER (NEW)
                const securityOpts: SecurityOptions = options.security === false
                    ? { skipAll: true }
                    : typeof options.security === 'object'
                        ? options.security
                        : {} // Default security enabled

                const securityResult = await runSecurityChecks(req, securityOpts)

                if (!securityResult.allowed) {
                    logger.warn('Security check failed', {
                        path: url.pathname,
                        ip: securityResult.clientInfo?.ip,
                        error: securityResult.error
                    })
                    return ResponseFactory.error(
                        securityResult.error || 'Security check failed',
                        securityResult.statusCode || 403,
                        'E_SECURITY_BLOCK'
                    )
                }

                // 2. Rate Limiting (P0 Priority)
                if (options.rateLimit) {
                    // Use fingerprint + IP for more accurate rate limiting
                    const ip = securityResult.clientInfo?.ip ||
                        req.headers.get('x-forwarded-for')?.split(',')[0] ||
                        req.headers.get('x-real-ip') ||
                        'anonymous'

                    const rateLimitKey = securityResult.fingerprint
                        ? `${ip}:${securityResult.fingerprint.slice(0, 8)}`
                        : ip

                    const limiter = rateLimiters[options.rateLimit]
                    const result = await limiter.limit(rateLimitKey)

                    if (!result.success) {
                        logger.warn('Rate limit exceeded', { ip, type: options.rateLimit })
                        const response = ResponseFactory.error(
                            'Too many requests. Please try again later.',
                            429,
                            'E_RATE_LIMIT'
                        )
                        response.headers.set('Retry-After', String(Math.ceil((result.reset - Date.now()) / 1000)))
                        return response
                    }
                }

                let body: T | undefined

                // 3. Body Parsing & Validation
                if (options.schema) {
                    try {
                        const json = await req.json()
                        body = options.schema.parse(json)
                    } catch (error) {
                        if (error instanceof ZodError) {
                            return ResponseFactory.error('Validation Failed', 400, 'E_VALIDATION', error.issues)
                        }
                        return ResponseFactory.error('Invalid JSON', 400, 'E_INVALID_JSON')
                    }
                }

                let user: any = undefined

                // 3.5 Authentication
                // Always try to resolve user if possible (provided to all handlers)
                const resolvedUser = await AuthGuard.tryUser()
                if (resolvedUser) {
                    user = { userId: resolvedUser.userId, role: resolvedUser.role }
                }

                if (options.requiresAuth && !user) {
                    // If explicitly required but not found, return unauthorized
                    return ResponseFactory.error('Unauthorized', 401, 'E_UNAUTHORIZED')
                }

                // 4. Execute Handler with security context
                const response = await handler(req, {
                    params: context?.params,
                    body,
                    user,
                    security: {
                        fingerprint: securityResult.fingerprint,
                        clientIp: securityResult.clientInfo?.ip
                    }
                })

                // 5. Add security & tracing headers (if not already handled by ResponseFactory)
                const headers = new Headers(response.headers)
                headers.set('X-Request-ID', requestId)
                headers.set('X-Trace-ID', traceId)

                for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
                    if (!headers.has(key)) headers.set(key, value as string)
                }

                // 6. Log Response
                logger.response(label, req.method, url.pathname, response.status)

                return new NextResponse(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers
                })

            } catch (error: any) {
                // Centralized Error Handling
                logger.error('API Error', {
                    path: req.url,
                    error: error.message,
                    stack: error.stack
                })

                const status = error.status || 500
                // Check if it's a known AppError (like PaymentError)
                if (error.code && error.status) {
                    return ResponseFactory.error(error.message, error.status, error.code, error.details)
                }

                return ResponseFactory.error(error.message || 'Internal Server Error', status)
            }
        })
    }
}
