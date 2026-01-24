/**
 * CloudWatch Monitoring Integration
 * 
 * Publishes metrics to AWS CloudWatch for dashboards and alarms.
 */

// Note: For full CloudWatch integration, install: npm install @aws-sdk/client-cloudwatch
// This module provides the structure; actual SDK usage requires the package.

export interface MetricData {
    name: string
    value: number
    unit: 'Count' | 'Seconds' | 'Milliseconds' | 'Bytes' | 'Percent'
    dimensions?: Record<string, string>
}

// ============================================
// METRIC BUFFER (for batching)
// ============================================

const metricBuffer: MetricData[] = []
const FLUSH_INTERVAL_MS = 60000 // 1 minute
const MAX_BUFFER_SIZE = 100

/**
 * Record a metric (buffered for batch publishing)
 */
export function recordMetric(metric: MetricData): void {
    metricBuffer.push({
        ...metric,
        dimensions: {
            Environment: process.env.NODE_ENV || 'development',
            Service: 'nexnum-api',
            ...metric.dimensions,
        },
    })

    // Flush if buffer is full
    if (metricBuffer.length >= MAX_BUFFER_SIZE) {
        flushMetrics().catch(console.error)
    }
}

/**
 * Flush metrics to CloudWatch
 */
export async function flushMetrics(): Promise<void> {
    if (metricBuffer.length === 0) return

    const metrics = [...metricBuffer]
    metricBuffer.length = 0

    // In production with AWS SDK:
    // const client = new CloudWatchClient({ region: process.env.AWS_REGION })
    // await client.send(new PutMetricDataCommand({
    //     Namespace: 'NexNum',
    //     MetricData: metrics.map(m => ({
    //         MetricName: m.name,
    //         Value: m.value,
    //         Unit: m.unit,
    //         Dimensions: Object.entries(m.dimensions || {}).map(([k, v]) => ({ Name: k, Value: v })),
    //     })),
    // }))

    // For now, log metrics (can be picked up by CloudWatch Logs Insights)
    console.log('[CloudWatch] Metrics:', JSON.stringify({
        _type: 'METRICS',
        namespace: 'NexNum',
        timestamp: new Date().toISOString(),
        metrics,
    }))
}

// ============================================
// COMMON METRICS
// ============================================

/**
 * Record API request latency
 */
export function recordRequestLatency(endpoint: string, latencyMs: number, statusCode: number): void {
    recordMetric({
        name: 'RequestLatency',
        value: latencyMs,
        unit: 'Milliseconds',
        dimensions: { Endpoint: endpoint },
    })

    recordMetric({
        name: 'RequestCount',
        value: 1,
        unit: 'Count',
        dimensions: { Endpoint: endpoint, StatusCode: statusCode.toString() },
    })

    if (statusCode >= 400) {
        recordMetric({
            name: 'ErrorCount',
            value: 1,
            unit: 'Count',
            dimensions: { Endpoint: endpoint, StatusCode: statusCode.toString() },
        })
    }
}

/**
 * Record cache hit/miss
 */
export function recordCacheMetric(hit: boolean): void {
    recordMetric({
        name: hit ? 'CacheHit' : 'CacheMiss',
        value: 1,
        unit: 'Count',
    })
}

/**
 * Record database query time
 */
export function recordDbQueryTime(operation: string, latencyMs: number): void {
    recordMetric({
        name: 'DbQueryLatency',
        value: latencyMs,
        unit: 'Milliseconds',
        dimensions: { Operation: operation },
    })
}

/**
 * Record active numbers gauge
 */
export function recordActiveNumbers(count: number): void {
    recordMetric({
        name: 'ActiveNumbers',
        value: count,
        unit: 'Count',
    })
}

/**
 * Record provider API latency
 */
export function recordProviderLatency(provider: string, latencyMs: number, success: boolean): void {
    recordMetric({
        name: 'ProviderLatency',
        value: latencyMs,
        unit: 'Milliseconds',
        dimensions: { Provider: provider },
    })

    recordMetric({
        name: success ? 'ProviderSuccess' : 'ProviderFailure',
        value: 1,
        unit: 'Count',
        dimensions: { Provider: provider },
    })
}

// ============================================
// TIMER HELPER
// ============================================

/**
 * Create a timer for measuring duration
 */
export function startTimer(): () => number {
    const start = Date.now()
    return () => Date.now() - start
}

// ============================================
// INITIALIZATION
// ============================================

let flushInterval: NodeJS.Timeout | null = null

/**
 * Start periodic metric flushing
 */
export function startMetricFlushing(): void {
    if (flushInterval) return

    flushInterval = setInterval(() => {
        flushMetrics().catch(console.error)
    }, FLUSH_INTERVAL_MS)

    console.log('[CloudWatch] Metric flushing started')
}

/**
 * Stop metric flushing (for graceful shutdown)
 */
export async function stopMetricFlushing(): Promise<void> {
    if (flushInterval) {
        clearInterval(flushInterval)
        flushInterval = null
    }

    // Flush remaining metrics
    await flushMetrics()
    console.log('[CloudWatch] Metric flushing stopped')
}

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
    startMetricFlushing()
}
