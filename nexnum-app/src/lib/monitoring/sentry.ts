/**
 * Sentry Error Tracking Integration
 * 
 * To enable, add to your .env:
 * NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
 * SENTRY_AUTH_TOKEN=your_auth_token (for source maps)
 */

import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/core/logger'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

export function initSentry() {
    if (!SENTRY_DSN) {
        logger.warn('Sentry DSN not configured, error tracking disabled', { context: 'MONITORING' })
        return
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV,

        // Performance Monitoring
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

        // Session Replay (Optional)
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,

        // Integrations
        integrations: [
            Sentry.replayIntegration(),
        ],

        // Filtering
        beforeSend(event, hint) {
            // Filter out non-critical errors
            const error = hint.originalException
            if (error && typeof error === 'object' && 'message' in error) {
                const message = (error as Error).message

                // Ignore common non-issues
                if (message.includes('ResizeObserver loop')) return null
                if (message.includes('Network request failed')) return null
            }

            return event
        },

        // Additional context
        initialScope: {
            tags: {
                app: 'nexnum',
                version: process.env.npm_package_version || '1.0.0'
            }
        }
    })

    logger.info('Sentry error tracking initialized', { context: 'MONITORING' })
}

/**
 * Capture error with context
 */
export function captureError(error: Error, context?: Record<string, any>) {
    if (!SENTRY_DSN) {
        logger.error('Error captured (Sentry disabled)', { error: error.message, ...context })
        return
    }

    Sentry.withScope((scope) => {
        if (context) {
            scope.setExtras(context)
        }
        Sentry.captureException(error)
    })
}

/**
 * Capture message for non-error events
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    if (!SENTRY_DSN) {
        const logMethod = level === 'error' ? 'error' : (level === 'warning' ? 'warn' : 'info')
        logger[logMethod](message, { context: 'MONITORING' })
        return
    }

    Sentry.captureMessage(message, level)
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; role?: string }) {
    if (!SENTRY_DSN) return

    Sentry.setUser({
        id: user.id,
        email: user.email,
        // Don't include PII in production
        ...(process.env.NODE_ENV !== 'production' && { role: user.role })
    })
}

/**
 * Clear user context on logout
 */
export function clearUser() {
    if (!SENTRY_DSN) return
    Sentry.setUser(null)
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(category: string, message: string, data?: Record<string, any>) {
    if (!SENTRY_DSN) return

    Sentry.addBreadcrumb({
        category,
        message,
        data,
        level: 'info'
    })
}

// Re-export Sentry for direct access
export { Sentry }
