import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge, Metric } from 'prom-client'

// Singleton Registry to prevent HMR issues
const globalForMetrics = globalThis as unknown as {
    registry: Registry | undefined
}

export const registry = globalForMetrics.registry ?? new Registry()

// Only initialize defaults once
if (!globalForMetrics.registry) {
    collectDefaultMetrics({ register: registry, prefix: 'nexnum_' })
    globalForMetrics.registry = registry
}

// Helper to prevent "Metric already registered" errors on HMR
function register<T extends Metric>(name: string, factory: () => T): T {
    const existing = registry.getSingleMetric(name)
    if (existing) return existing as T
    return factory()
}

// --- DEFINITIONS (Industrial v2.0 + Backward Compatibility) ---

// 1. Wallet & Financial Integrity
export const wallet_transactions_total = register('nexnum_wallet_transactions_total', () => new Counter({
    name: 'nexnum_wallet_transactions_total',
    help: 'Total wallet transactions by type and status',
    labelNames: ['type', 'status'],
    registers: [registry]
}))

export const wallet_integrity_status = register('nexnum_wallet_integrity_status', () => new Gauge({
    name: 'nexnum_wallet_integrity_status',
    help: 'Financial integrity status (0=healthy, 1=drift_detected, 2=critical_failure)',
    registers: [registry]
}))

export const wallet_refunds_total = register('nexnum_wallet_refunds_total', () => new Counter({
    name: 'nexnum_wallet_refunds_total',
    help: 'Total absolute refunds processed',
    labelNames: ['reason'],
    registers: [registry]
}))

export const wallet_deposits_total = register('nexnum_wallet_deposits_total', () => new Counter({
    name: 'nexnum_wallet_deposits_total',
    help: 'Total absolute deposits processed',
    registers: [registry]
}))

export const wallet_sentinel_drift_total = register('nexnum_wallet_sentinel_drift_total', () => new Gauge({
    name: 'nexnum_wallet_sentinel_drift_total',
    help: 'Total absolute financial drift detected by Sentinel (POINTS)',
    registers: [registry]
}))

export const wallet_sentinel_status = register('nexnum_wallet_sentinel_status', () => new Gauge({
    name: 'nexnum_wallet_sentinel_status',
    help: 'Financial integrity status (0=healthy, 1=drift_detected, 2=critical_integrity_failure)',
    registers: [registry]
}))

export const wallet_operation_duration_seconds = register('nexnum_wallet_operation_duration_seconds', () => new Histogram({
    name: 'nexnum_wallet_operation_duration_seconds',
    help: 'Duration of wallet operations',
    labelNames: ['operation'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1],
    registers: [registry]
}))

// 2. HTTP & API Performance (SLA Tracking)
export const http_requests_total = register('nexnum_http_requests_total', () => new Counter({
    name: 'nexnum_http_requests_total',
    help: 'Standard API request counter',
    labelNames: ['route', 'method', 'status_code'],
    registers: [registry]
}))

export const http_request_duration_seconds = register('nexnum_http_request_duration_seconds', () => new Histogram({
    name: 'nexnum_http_request_duration_seconds',
    help: 'API Latency Distribution',
    labelNames: ['route', 'method', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry]
}))

export const purchase_duration_seconds = register('nexnum_purchase_duration_seconds', () => new Histogram({
    name: 'nexnum_purchase_duration_seconds',
    help: 'Latency of purchase flow stages',
    labelNames: ['stage', 'provider', 'country'],
    buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [registry]
}))

// 3. Worker & Platform Lifecycle
export const worker_queue_depth = register('nexnum_worker_queue_depth', () => new Gauge({
    name: 'nexnum_worker_queue_depth',
    help: 'Current jobs in queue by state',
    labelNames: ['queue', 'state'],
    registers: [registry]
}))

export const worker_jobs_processed_total = register('nexnum_worker_jobs_processed_total', () => new Counter({
    name: 'nexnum_worker_jobs_processed_total',
    help: 'Total worker jobs throughput',
    labelNames: ['queue', 'status'],
    registers: [registry]
}))

export const lifecycle_jobs_total = register('nexnum_lifecycle_jobs_total', () => new Counter({
    name: 'nexnum_lifecycle_jobs_total',
    help: 'Total activation lifecycle jobs processed',
    labelNames: ['type', 'status'],
    registers: [registry]
}))

export const lifecycle_circuit_state = register('nexnum_lifecycle_circuit_state', () => new Gauge({
    name: 'nexnum_lifecycle_circuit_state',
    help: 'Current state of lifecycle circuit breaker (0=closed, 1=open, 2=half-open)',
    registers: [registry]
}))

export const lifecycle_job_duration = register('nexnum_lifecycle_job_duration', () => new Histogram({
    name: 'nexnum_lifecycle_job_duration',
    help: 'Duration of lifecycle jobs',
    labelNames: ['type'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry]
}))

export const order_state_transitions_total = register('nexnum_order_state_transitions_total', () => new Counter({
    name: 'nexnum_order_state_transitions_total',
    help: 'Total order state transitions',
    labelNames: ['from', 'to', 'provider'],
    registers: [registry]
}))

export const order_processing_duration_seconds = register('nexnum_order_processing_duration_seconds', () => new Histogram({
    name: 'nexnum_order_processing_duration_seconds',
    help: 'Duration of order processing stages',
    labelNames: ['provider', 'stage'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [registry]
}))

// 4. Providers
export const provider_last_sync_timestamp = register('nexnum_provider_last_sync_timestamp', () => new Gauge({
    name: 'nexnum_provider_last_sync_timestamp',
    help: 'Unix timestamp of the last successful provider catalog sync',
    registers: [registry]
}))

export const provider_latency_seconds = register('nexnum_provider_latency_seconds', () => new Histogram({
    name: 'nexnum_provider_latency_seconds',
    help: 'Upstream provider API latency',
    labelNames: ['provider_id', 'method'],
    buckets: [0.5, 1, 2, 5, 10, 30],
    registers: [registry]
}))

export const provider_api_calls_total = register('nexnum_provider_api_calls_total', () => new Counter({
    name: 'nexnum_provider_api_calls_total',
    help: 'Total calls to SMS providers',
    labelNames: ['provider', 'method', 'status'],
    registers: [registry]
}))

export const provider_health_status = register('nexnum_provider_health_status', () => new Gauge({
    name: 'nexnum_provider_health_status',
    help: 'Current health status (0=healthy, 1=degraded, 2=down)',
    labelNames: ['provider'],
    registers: [registry]
}))

export const provider_health_success_rate = register('nexnum_provider_health_success_rate', () => new Gauge({
    name: 'nexnum_provider_health_success_rate',
    help: 'Success rate of provider health checks',
    labelNames: ['provider'],
    registers: [registry]
}))

export const provider_health_latency_avg = register('nexnum_provider_health_latency_avg', () => new Gauge({
    name: 'nexnum_provider_health_latency_avg',
    help: 'Average latency of provider health checks',
    labelNames: ['provider'],
    registers: [registry]
}))

// 5. Infrastructure & System
export const system_disk_usage_percent = register('nexnum_system_disk_usage_percent', () => new Gauge({
    name: 'nexnum_system_disk_usage_percent',
    help: 'Host disk usage percentage',
    registers: [registry]
}))

export const system_memory_usage_bytes = register('nexnum_system_memory_usage_bytes', () => new Gauge({
    name: 'nexnum_system_memory_usage_bytes',
    help: 'System memory usage in bytes',
    labelNames: ['type'],
    registers: [registry]
}))

export const system_uptime_seconds = register('nexnum_system_uptime_seconds', () => new Gauge({
    name: 'nexnum_system_uptime_seconds',
    help: 'System uptime in seconds',
    registers: [registry]
}))

export const system_event_loop_lag_seconds = register('nexnum_system_event_loop_lag_seconds', () => new Gauge({
    name: 'nexnum_system_event_loop_lag_seconds',
    help: 'Node.js event loop lag in seconds',
    registers: [registry]
}))

export const process_cpu_usage = register('nexnum_process_cpu_usage', () => new Gauge({
    name: 'nexnum_process_cpu_usage',
    help: 'Process CPU usage percentage',
    registers: [registry]
}))

export const db_connections = register('nexnum_db_connections', () => new Gauge({
    name: 'nexnum_db_connections',
    help: 'Prisma/Postgres connection pool status',
    labelNames: ['state'], // active, idle, max
    registers: [registry]
}))

export const active_numbers = register('nexnum_active_numbers', () => new Gauge({
    name: 'nexnum_active_numbers',
    help: 'Current active SMS rentals',
    registers: [registry]
}))

export const active_orders_gauge = register('nexnum_active_orders_gauge', () => new Gauge({
    name: 'nexnum_active_orders_gauge',
    help: 'Current number of active orders',
    labelNames: ['provider', 'status'],
    registers: [registry]
}))

// 6. Search & SMS
export const search_latency = register('nexnum_search_latency', () => new Histogram({
    name: 'nexnum_search_latency',
    help: 'Latency of number searches',
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [registry]
}))

export const search_empty_results_total = register('nexnum_search_empty_results_total', () => new Counter({
    name: 'nexnum_search_empty_results_total',
    help: 'Total empty search results',
    registers: [registry]
}))

export const multi_sms_sequences_total = register('nexnum_multi_sms_sequences_total', () => new Counter({
    name: 'nexnum_multi_sms_sequences_total',
    help: 'Total multi-SMS sequences processed',
    registers: [registry]
}))

export const sms_delivery_latency_seconds = register('nexnum_sms_delivery_latency_seconds', () => new Histogram({
    name: 'nexnum_sms_delivery_latency_seconds',
    help: 'Latency of SMS delivery',
    buckets: [1, 5, 10, 30, 60],
    registers: [registry]
}))

// 7. Webhooks
export const webhook_deliveries_total = register('nexnum_webhook_deliveries_total', () => new Counter({
    name: 'nexnum_webhook_deliveries_total',
    help: 'Total outbound webhook delivery attempts',
    labelNames: ['event', 'status', 'response_code'],
    registers: [registry]
}))

export const webhook_delivery_duration_seconds = register('nexnum_webhook_delivery_duration_seconds', () => new Histogram({
    name: 'nexnum_webhook_delivery_duration_seconds',
    help: 'Latency of outbound webhook deliveries',
    labelNames: ['event'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [registry]
}))

// 8. Auth & AI
export const auth_events_total = register('nexnum_auth_events_total', () => new Counter({
    name: 'nexnum_auth_events_total',
    help: 'Total authentication events',
    labelNames: ['type', 'status'],
    registers: [registry]
}))

export const ai_token_usage_total = register('nexnum_ai_token_usage_total', () => new Counter({
    name: 'nexnum_ai_token_usage_total',
    help: 'Total tokens consumed by AI services',
    labelNames: ['model', 'type'],
    registers: [registry]
}))

export const ai_budget_spend_usd = register('nexnum_ai_budget_spend_usd', () => new Gauge({
    name: 'nexnum_ai_budget_spend_usd',
    help: 'Current daily AI budget spend in USD',
    registers: [registry]
}))

// 8. Compatibility Aliases (Batch/Legacy)
export const batch_poll_duration_seconds = register('nexnum_batch_poll_duration_seconds', () => new Histogram({
    name: 'nexnum_batch_poll_duration_seconds',
    help: 'Duration of batch polling operations',
    labelNames: ['provider'],
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    registers: [registry]
}))

export const batch_poll_items_total = register('nexnum_batch_poll_items_total', () => new Counter({
    name: 'nexnum_batch_poll_items_total',
    help: 'Total items processed in batch polls',
    labelNames: ['provider', 'result'],
    registers: [registry]
}))

export const batch_poll_api_calls_saved = register('nexnum_batch_poll_api_calls_saved', () => new Counter({
    name: 'nexnum_batch_poll_api_calls_saved',
    help: 'API calls saved by batch polling (vs individual)',
    labelNames: ['provider'],
    registers: [registry]
}))

export const polling_active_jobs = register('nexnum_polling_active_jobs', () => new Gauge({
    name: 'nexnum_polling_active_jobs',
    help: 'Current number of active polling jobs',
    labelNames: ['provider'],
    registers: [registry]
}))

// --- INSTRUMENTATION HELPERS ---

/**
 * Tracks a financial integrity event
 */
export function recordFinancialIntegrity(status: 0 | 1 | 2) {
    wallet_integrity_status.set(status)
}

/**
 * Backward compatible financial health reporting
 */
export function reportFinancialHealth(drift: number, status: number) {
    wallet_sentinel_drift_total.set(Math.abs(drift))
    wallet_sentinel_status.set(status)
    wallet_integrity_status.set(status as any)
}

/**
 * Updates provider sync pulse
 */
export function recordProviderSync() {
    provider_last_sync_timestamp.set(Math.floor(Date.now() / 1000))
}

/**
 * Track a provider API request
 */
export function trackProviderRequest(provider: string, method: string, statusCode: number, latencySeconds: number) {
    provider_api_calls_total.inc({
        provider: provider,
        method: method,
        status: statusCode < 400 ? 'success' : 'error'
    })

    provider_latency_seconds.observe({
        provider_id: provider,
        method: method
    }, latencySeconds)
}

/**
 * Updates host hardware stats
 */
export function updateHardwareStats(diskPercent: number) {
    system_disk_usage_percent.set(diskPercent)

    const mem = process.memoryUsage()
    system_memory_usage_bytes.set({ type: 'heapUsed' }, mem.heapUsed)
    system_memory_usage_bytes.set({ type: 'rss' }, mem.rss)
}

/**
 * Alias for backward compatibility
 */
export function updateSystemMetrics() {
    updateHardwareStats(0) // Placeholder
}

/**
 * Updates Active Numbers Count (Backward Compatible)
 */
export function updateActiveNumbers(type: string | number, count?: number) {
    if (typeof type === 'number') {
        active_numbers.set(type)
    } else if (count !== undefined) {
        active_numbers.set(count)
        active_orders_gauge.set({ status: 'ACTIVE', provider: 'total' }, count)
    }
}

/**
 * Update Worker Queue Metrics
 */
export function updateWorkerQueue(queue: string, waiting: number, active: number, failed: number) {
    worker_queue_depth.set({ queue, state: 'pending' }, waiting)
    worker_queue_depth.set({ queue, state: 'active' }, active)
    worker_queue_depth.set({ queue, state: 'failed' }, failed)

    // Legacy mapping
    polling_active_jobs.set({ provider: queue }, active)
}

/**
 * Update DB Connections
 */
export function updateDbConnections(active: number, idle: number, max: number) {
    db_connections.set({ state: 'active' }, active)
    db_connections.set({ state: 'idle' }, idle)
    db_connections.set({ state: 'max' }, max)
}

/**
 * Record an Incident
 */
export function recordIncident(type: string, severity: string) {
    // Basic counter for incidents if needed, or just log
}

/**
 * Track an HTTP request with automatic sanitization
 */
export function trackHttpRequest(route: string, method: string, statusCode: number) {
    http_requests_total.inc({
        route,
        method,
        status_code: String(statusCode)
    })
}

/**
 * Track an HTTP duration
 */
export function trackHttpDuration(route: string, method: string, statusCode: number, durationSeconds: number) {
    http_request_duration_seconds.observe({
        route,
        method,
        status_code: String(statusCode)
    }, durationSeconds)
}

// System Aliases
export const system_memory_usage = system_memory_usage_bytes
export const system_uptime = system_uptime_seconds
export const search_empty_results = search_empty_results_total
