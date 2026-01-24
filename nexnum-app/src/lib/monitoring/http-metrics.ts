/**
 * HTTP Metrics Instrumentation
 * 
 * Middleware utilities for instrumenting Next.js API routes with Prometheus metrics.
 * Automatically tracks request counts, latencies, and error rates.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
    trackHttpRequest,
    trackHttpDuration,
    trackProviderRequest
} from '@/lib/metrics'

// ============================================================================
// TYPES
// ============================================================================

interface MetricsOptions {
    /** Route identifier for metrics (e.g., '/api/users', '/api/numbers/[id]') */
    route: string
    /** Optional service name override (default: 'nexnum-api') */
    service?: string
    /** Skip tracking for this request */
    skip?: boolean
}

type RouteHandler = (
    request: NextRequest,
    context?: { params?: Record<string, string> }
) => Promise<NextResponse> | NextResponse

// ============================================================================
// MIDDLEWARE WRAPPER
// ============================================================================

/**
 * Wrap a Next.js API route handler with automatic metrics instrumentation.
 * 
 * @example
 * // In your route.ts:
 * import { withMetrics } from '@/lib/monitoring/http-metrics'
 * 
 * async function handler(request: NextRequest) {
 *     return NextResponse.json({ data: 'hello' })
 * }
 * 
 * export const GET = withMetrics(handler, { route: '/api/example' })
 */
export function withMetrics(
    handler: RouteHandler,
    options: MetricsOptions
): RouteHandler {
    return async (request: NextRequest, context?: { params?: Record<string, string> }) => {
        if (options.skip) {
            return handler(request, context)
        }

        const startTime = performance.now()
        let statusCode = 200

        try {
            const response = await handler(request, context)
            statusCode = response.status
            return response
        } catch (error) {
            statusCode = 500
            throw error
        } finally {
            const durationMs = performance.now() - startTime
            const durationSeconds = durationMs / 1000

            // Track request count
            trackHttpRequest(options.route, request.method, statusCode)

            // Track request duration
            trackHttpDuration(
                options.route,
                request.method,
                statusCode,
                durationSeconds
            )
        }
    }
}

// ============================================================================
// PROVIDER REQUEST INSTRUMENTATION
// ============================================================================

/**
 * Instrument a provider API call with metrics.
 * 
 * @example
 * const response = await instrumentProviderCall(
 *     'smsactivate',
 *     'getNumber',
 *     async () => {
 *         return await fetch(providerUrl)
 *     }
 * )
 */
export async function instrumentProviderCall<T>(
    providerId: string,
    method: string,
    fn: () => Promise<T>
): Promise<T> {
    const startTime = performance.now()
    let statusCode = 200

    try {
        const result = await fn()
        return result
    } catch (error: any) {
        statusCode = error.statusCode || error.status || 500
        throw error
    } finally {
        const durationMs = performance.now() - startTime
        const durationSeconds = durationMs / 1000

        trackProviderRequest(providerId, method, statusCode, durationSeconds)
    }
}

/**
 * Create a scoped provider instrumenter for cleaner code.
 * 
 * @example
 * const instrument = createProviderInstrumenter('smsactivate')
 * 
 * const number = await instrument('getNumber', async () => {
 *     return provider.getNumber(serviceId, countryId)
 * })
 */
export function createProviderInstrumenter(providerId: string) {
    return async function instrument<T>(
        method: string,
        fn: () => Promise<T>
    ): Promise<T> {
        return instrumentProviderCall(providerId, method, fn)
    }
}

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Simple timer for measuring operation durations.
 * 
 * @example
 * const timer = createTimer()
 * await doSomething()
 * console.log(`Took ${timer.elapsedMs()}ms`)
 */
export function createTimer() {
    const start = performance.now()

    return {
        elapsedMs: () => performance.now() - start,
        elapsedSeconds: () => (performance.now() - start) / 1000
    }
}

/**
 * Measure the duration of an async operation.
 * 
 * @example
 * const { result, durationMs } = await measureAsync(async () => {
 *     return await fetchData()
 * })
 */
export async function measureAsync<T>(
    fn: () => Promise<T>
): Promise<{ result: T; durationMs: number; durationSeconds: number }> {
    const timer = createTimer()
    const result = await fn()

    return {
        result,
        durationMs: timer.elapsedMs(),
        durationSeconds: timer.elapsedSeconds()
    }
}
