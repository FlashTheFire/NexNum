/**
 * API Performance Metrics
 * 
 * Lightweight in-memory metrics for monitoring without external dependencies
 * Exports /api/metrics endpoint data
 */

interface EndpointMetric {
    count: number
    totalDuration: number
    minDuration: number
    maxDuration: number
    errors: number
    last4xx: number
    last5xx: number
}

class MetricsCollector {
    private endpoints: Map<string, EndpointMetric> = new Map()
    private startTime: number = Date.now()

    /**
     * Record an API request
     */
    record(
        method: string,
        path: string,
        status: number,
        durationMs: number
    ): void {
        const key = `${method} ${this.normalizePath(path)}`

        if (!this.endpoints.has(key)) {
            this.endpoints.set(key, {
                count: 0,
                totalDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                errors: 0,
                last4xx: 0,
                last5xx: 0,
            })
        }

        const metric = this.endpoints.get(key)!
        metric.count++
        metric.totalDuration += durationMs
        metric.minDuration = Math.min(metric.minDuration, durationMs)
        metric.maxDuration = Math.max(metric.maxDuration, durationMs)

        if (status >= 400 && status < 500) {
            metric.last4xx = Date.now()
        } else if (status >= 500) {
            metric.last5xx = Date.now()
            metric.errors++
        }
    }

    /**
     * Normalize path (remove IDs for grouping)
     */
    private normalizePath(path: string): string {
        return path
            .replace(/\/[0-9a-f]{24,}/g, '/:id')  // MongoDB ObjectIds
            .replace(/\/[0-9]+/g, '/:id')          // Numeric IDs
            .replace(/\/[a-z0-9-]{36}/g, '/:uuid') // UUIDs
    }

    /**
     * Get all metrics
     */
    getMetrics(): {
        uptime: number
        endpoints: Record<string, {
            count: number
            avgDuration: number
            minDuration: number
            maxDuration: number
            errorRate: number
        }>
    } {
        const result: Record<string, any> = {}

        for (const [key, metric] of this.endpoints.entries()) {
            result[key] = {
                count: metric.count,
                avgDuration: Math.round(metric.totalDuration / metric.count),
                minDuration: metric.minDuration === Infinity ? 0 : metric.minDuration,
                maxDuration: metric.maxDuration,
                errorRate: metric.count > 0 ? (metric.errors / metric.count * 100).toFixed(2) + '%' : '0%',
            }
        }

        return {
            uptime: Date.now() - this.startTime,
            endpoints: result,
        }
    }

    /**
     * Reset all metrics
     */
    reset(): void {
        this.endpoints.clear()
        this.startTime = Date.now()
    }
}

export const metrics = new MetricsCollector()

/**
 * Get metrics in Prometheus format (for /api/metrics route)
 */
export async function getMetrics(): Promise<string> {
    const data = metrics.getMetrics()
    const lines: string[] = []

    // System metrics
    lines.push(`# HELP nexnum_uptime_seconds Application uptime in seconds`)
    lines.push(`# TYPE nexnum_uptime_seconds gauge`)
    lines.push(`nexnum_uptime_seconds ${Math.floor(data.uptime / 1000)}`)

    // Endpoint metrics
    for (const [endpoint, stats] of Object.entries(data.endpoints)) {
        const safeName = endpoint.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
        lines.push(`nexnum_http_requests_total{endpoint="${endpoint}"} ${stats.count}`)
        lines.push(`nexnum_http_request_duration_avg_ms{endpoint="${endpoint}"} ${stats.avgDuration}`)
    }

    return lines.join('\n')
}

/**
 * Get Prometheus content type
 */
export function getMetricsContentType(): string {
    return 'text/plain; version=0.0.4; charset=utf-8'
}

// ============================================================================
// OUTBOX METRICS (Stubs for outbox-worker compatibility)
// ============================================================================

class SimpleGauge {
    private value: number = 0
    set(val: number): void { this.value = val }
    get(): number { return this.value }
}

class SimpleCounter {
    private values: Map<string, number> = new Map()
    inc(labels: Record<string, string> = {}, amount: number = 1): void {
        const key = JSON.stringify(labels)
        this.values.set(key, (this.values.get(key) || 0) + amount)
    }
    get(labels: Record<string, string> = {}): number {
        return this.values.get(JSON.stringify(labels)) || 0
    }
}

export const outboxPendingCount = new SimpleGauge()
export const outboxLagSeconds = new SimpleGauge()
export const outboxProcessedTotal = new SimpleCounter()

