/**
 * Request Context & Correlation IDs
 * 
 * Professional request tracing for debugging and monitoring
 * Each request gets a unique ID that flows through logs and Sentry
 */

import { AsyncLocalStorage } from 'async_hooks'
import { randomUUID } from 'crypto'

interface RequestContext {
    requestId: string
    startTime: number
    userId?: string
    path?: string
    method?: string
}

// AsyncLocalStorage for request-scoped context
const requestContext = new AsyncLocalStorage<RequestContext>()

/**
 * Generate a short, readable request ID
 */
export function generateRequestId(): string {
    return `req_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`
}

/**
 * Run a function with request context
 */
export function withRequestContext<T>(
    context: Partial<RequestContext>,
    fn: () => T
): T {
    const fullContext: RequestContext = {
        requestId: context.requestId || generateRequestId(),
        startTime: context.startTime || Date.now(),
        ...context,
    }
    return requestContext.run(fullContext, fn)
}

/**
 * Get current request context (or undefined if not in context)
 */
export function getRequestContext(): RequestContext | undefined {
    return requestContext.getStore()
}

/**
 * Get current request ID (or generate one if not in context)
 */
export function getRequestId(): string {
    return requestContext.getStore()?.requestId || generateRequestId()
}

/**
 * Calculate request duration
 */
export function getRequestDuration(): number | undefined {
    const ctx = requestContext.getStore()
    return ctx ? Date.now() - ctx.startTime : undefined
}

/**
 * Set user ID in current context
 */
export function setContextUserId(userId: string): void {
    const ctx = requestContext.getStore()
    if (ctx) {
        ctx.userId = userId
    }
}
