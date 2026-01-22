import { NextResponse } from 'next/server'
import { ZodError, ZodSchema } from 'zod'
import { logger } from '@/lib/core/logger'
import { rateLimiters, RatelimitType } from '@/lib/auth/ratelimit'
import { runSecurityChecks, SecurityOptions, createSecurityErrorResponse, API_SECURITY_HEADERS } from '@/lib/security'

type ApiHandler<T> = (
    req: Request,
    context: { params: any; body?: T; security?: { fingerprint?: string; clientIp?: string } }
) => Promise<NextResponse>

interface ApiOptions<T> {
    schema?: ZodSchema<T>
    roles?: string[] // Future: Role Based Access Control
    rateLimit?: RatelimitType // Rate limit type: 'api' | 'auth' | 'admin' | 'transaction'

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
    return async (req: Request, context: { params: any }) => {
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
                return createSecurityErrorResponse(
                    securityResult.error || 'Security check failed',
                    securityResult.statusCode || 403
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
                    return NextResponse.json(
                        {
                            success: false,
                            error: 'Too many requests. Please try again later.',
                            retryAfter: Math.ceil((result.reset - Date.now()) / 1000)
                        },
                        {
                            status: 429,
                            headers: {
                                'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
                                'X-RateLimit-Limit': String(result.limit),
                                'X-RateLimit-Remaining': String(result.remaining),
                                ...API_SECURITY_HEADERS
                            }
                        }
                    )
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
                        return NextResponse.json(
                            {
                                success: false,
                                error: 'Validation Failed',
                                details: (error as any).issues
                            },
                            { status: 400, headers: API_SECURITY_HEADERS }
                        )
                    }
                    return NextResponse.json(
                        { success: false, error: 'Invalid JSON' },
                        { status: 400, headers: API_SECURITY_HEADERS }
                    )
                }
            }

            // 4. Execute Handler with security context
            const response = await handler(req, {
                ...context,
                body,
                security: {
                    fingerprint: securityResult.fingerprint,
                    clientIp: securityResult.clientInfo?.ip
                }
            })

            // 5. Add security headers to response
            const headers = new Headers(response.headers)
            for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
                if (!headers.has(key)) {
                    headers.set(key, value as string)
                }
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
            const url = new URL(req.url)
            const label = url.pathname.startsWith('/api') ? 'API' : 'APP'
            logger.response(label, req.method, url.pathname, status)

            return NextResponse.json(
                {
                    success: false,
                    error: error.message || 'Internal Server Error'
                },
                { status: status, headers: API_SECURITY_HEADERS }
            )
        }
    }
}
