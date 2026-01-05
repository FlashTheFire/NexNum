import { NextResponse } from 'next/server'
import { ZodError, ZodSchema } from 'zod'
import { logger } from './logger'
import { rateLimiters, RatelimitType } from './ratelimit'

type ApiHandler<T> = (
    req: Request,
    context: { params: any; body?: T }
) => Promise<NextResponse>

interface ApiOptions<T> {
    schema?: ZodSchema<T>
    roles?: string[] // Future: Role Based Access Control
    rateLimit?: RatelimitType // Rate limit type: 'api' | 'auth' | 'admin' | 'transaction'
}

/**
 * Professional API Wrapper
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
            // 0. Rate Limiting (P0 Priority)
            if (options.rateLimit) {
                const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                    req.headers.get('x-real-ip') ||
                    'anonymous'

                const limiter = rateLimiters[options.rateLimit]
                const result = await limiter.limit(ip)

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
                            }
                        }
                    )
                }
            }

            let body: T | undefined

            // 1. Body Parsing & Validation
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
                            { status: 400 }
                        )
                    }
                    return NextResponse.json(
                        { success: false, error: 'Invalid JSON' },
                        { status: 400 }
                    )
                }
            }

            // 2. Execute Handler
            return await handler(req, { ...context, body })

        } catch (error: any) {
            // 3. Centralized Error Handling
            logger.error('API Error', {
                path: req.url,
                error: error.message,
                stack: error.stack
            })

            return NextResponse.json(
                {
                    success: false,
                    error: error.message || 'Internal Server Error'
                },
                { status: error.status || 500 }
            )
        }
    }
}

