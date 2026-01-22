/**
 * Security Middleware
 * 
 * Central security enforcement that combines all security layers.
 * This should be used in conjunction with api-handler.
 */

import { NextResponse } from 'next/server'
import { validateCSRFRequest, requiresCSRF, setCSRFCookie } from './csrf'
import { validateOrigin, getClientInfo, isLikelyBot } from './origin-guard'
import { checkBrowser, requireRealBrowser } from './browser-check'
import { generateFingerprint, getFingerprintId } from './fingerprint'
import { validateRequestSignature } from './request-signing'
import { API_SECURITY_HEADERS } from './headers'
import { logger } from '@/lib/core/logger'

export interface SecurityCheckResult {
    allowed: boolean
    error?: string
    statusCode?: number
    clientInfo?: ReturnType<typeof getClientInfo>
    fingerprint?: string
}

export interface SecurityOptions {
    // Skip all checks (dangerous, use for public endpoints only)
    skipAll?: boolean

    // Individual layer toggles
    requireCSRF?: boolean
    requireOriginCheck?: boolean
    requireBrowserCheck?: boolean
    requireSignature?: boolean

    // Strictness levels
    browserCheckLevel?: 'none' | 'basic' | 'strict'

    // Allow API key authenticated requests to bypass browser checks
    allowApiKey?: boolean

    // Log security events
    logEvents?: boolean
}

const DEFAULT_OPTIONS: SecurityOptions = {
    requireCSRF: true,
    requireOriginCheck: true,
    requireBrowserCheck: false, // Default off, enable for sensitive endpoints
    requireSignature: false, // Default off, enable for critical endpoints
    browserCheckLevel: 'basic',
    allowApiKey: true,
    logEvents: true
}

/**
 * Run security checks on a request
 */
export async function runSecurityChecks(
    request: Request,
    options: SecurityOptions = {}
): Promise<SecurityCheckResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const headers = request.headers
    const method = request.method
    const url = new URL(request.url)

    // Collect client info
    const clientInfo = getClientInfo(headers)
    const fingerprint = getFingerprintId(headers)

    // Log if enabled
    if (opts.logEvents) {
        logger.debug('Security check', {
            path: url.pathname,
            ip: clientInfo.ip,
            fingerprint: fingerprint.slice(0, 8)
        })
    }

    // Skip all checks if requested
    if (opts.skipAll) {
        return { allowed: true, clientInfo, fingerprint }
    }

    // Check for API key authentication (bypasses some browser checks)
    const hasApiKey = headers.get('x-api-key') ||
        headers.get('authorization')?.startsWith('Bearer nxn_')

    // 1. Origin Validation
    if (opts.requireOriginCheck && !hasApiKey) {
        const originResult = validateOrigin(headers)
        if (!originResult.valid) {
            if (opts.logEvents) {
                logger.warn('Origin check failed', {
                    ip: clientInfo.ip,
                    origin: originResult.origin,
                    error: originResult.error
                })
            }
            return {
                allowed: false,
                error: originResult.error,
                statusCode: 403,
                clientInfo,
                fingerprint
            }
        }
    }

    // 2. CSRF Validation (for state-changing requests without API key)
    if (opts.requireCSRF && requiresCSRF(method) && !hasApiKey) {
        const csrfResult = await validateCSRFRequest(headers)
        if (!csrfResult.valid) {
            if (opts.logEvents) {
                logger.warn('CSRF check failed', {
                    ip: clientInfo.ip,
                    error: csrfResult.error
                })
            }
            return {
                allowed: false,
                error: csrfResult.error,
                statusCode: 403,
                clientInfo,
                fingerprint
            }
        }
    }

    // 3. Browser Attestation (if required)
    if (opts.requireBrowserCheck && !hasApiKey) {
        if (opts.browserCheckLevel === 'strict') {
            const browserResult = requireRealBrowser(headers)
            if (!browserResult.allowed) {
                if (opts.logEvents) {
                    logger.warn('Browser check failed (strict)', {
                        ip: clientInfo.ip,
                        reason: browserResult.reason
                    })
                }
                return {
                    allowed: false,
                    error: 'Request blocked: automated access detected',
                    statusCode: 403,
                    clientInfo,
                    fingerprint
                }
            }
        } else if (opts.browserCheckLevel === 'basic') {
            if (isLikelyBot(headers)) {
                if (opts.logEvents) {
                    logger.warn('Bot detected', {
                        ip: clientInfo.ip,
                        ua: clientInfo.userAgent.slice(0, 100)
                    })
                }
                return {
                    allowed: false,
                    error: 'Request blocked: bot detected',
                    statusCode: 403,
                    clientInfo,
                    fingerprint
                }
            }
        }
    }

    // 4. Request Signature (if required)
    if (opts.requireSignature) {
        // Get body for signature verification
        let body: string | undefined
        try {
            body = await request.clone().text()
        } catch {
            body = undefined
        }

        const sigResult = await validateRequestSignature(
            headers,
            method,
            url.pathname,
            body
        )

        if (!sigResult.valid) {
            if (opts.logEvents) {
                logger.warn('Signature check failed', {
                    ip: clientInfo.ip,
                    error: sigResult.error
                })
            }
            return {
                allowed: false,
                error: sigResult.error,
                statusCode: 401,
                clientInfo,
                fingerprint
            }
        }
    }

    // All checks passed
    return { allowed: true, clientInfo, fingerprint }
}

/**
 * Create security error response
 */
export function createSecurityErrorResponse(
    error: string,
    statusCode: number = 403
): NextResponse {
    const headers = new Headers()
    for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
        headers.set(key, value as string)
    }

    return NextResponse.json(
        {
            success: false,
            error,
            code: 'SECURITY_ERROR'
        },
        { status: statusCode, headers }
    )
}

/**
 * Middleware for applying security to route handlers
 */
export function withSecurity(options: SecurityOptions = {}) {
    return async function securityMiddleware(
        request: Request,
        next: () => Promise<NextResponse>
    ): Promise<NextResponse> {
        const result = await runSecurityChecks(request, options)

        if (!result.allowed) {
            return createSecurityErrorResponse(result.error!, result.statusCode)
        }

        return next()
    }
}

// Re-export all security utilities
export * from './csrf'
export * from './origin-guard'
export * from './browser-check'
export * from './fingerprint'
export * from './request-signing'
export * from './headers'
export * from './sensitive-actions'
