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

// --- DEFINITIONS ---

export const wallet_transactions_total = register('nexnum_wallet_transactions_total', () => new Counter({
    name: 'nexnum_wallet_transactions_total',
    help: 'Total wallet transactions by type and status',
    labelNames: ['type', 'status'],
    registers: [registry]
}))

export const purchase_duration_seconds = register('nexnum_purchase_duration_seconds', () => new Histogram({
    name: 'nexnum_purchase_duration_seconds',
    help: 'Latency of purchase flow stages',
    labelNames: ['stage', 'provider', 'country'], // stage: 'provider_call', 'db_commit'
    buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [registry]
}))

export const provider_api_calls_total = register('nexnum_provider_api_calls_total', () => new Counter({
    name: 'nexnum_provider_api_calls_total',
    help: 'Total calls to SMS providers',
    labelNames: ['provider', 'method', 'status'], // status: 'success', 'error'
    registers: [registry]
}))

export const polling_active_jobs = register('nexnum_polling_active_jobs', () => new Gauge({
    name: 'nexnum_polling_active_jobs',
    help: 'Current number of active polling jobs',
    labelNames: ['provider'],
    registers: [registry]
}))

export const sms_received_total = register('nexnum_sms_received_total', () => new Counter({
    name: 'nexnum_sms_received_total',
    help: 'Total SMS received per provider',
    labelNames: ['provider', 'service'],
    registers: [registry]
}))

export const reservation_stuck_count = register('nexnum_reservation_stuck_count', () => new Gauge({
    name: 'nexnum_reservation_stuck_count',
    help: 'Number of stalled purchase orders detected by reconciler',
    registers: [registry]
}))

// --- SYSTEM METRICS ---

export const system_memory_usage = register('nexnum_system_memory_usage', () => new Gauge({
    name: 'nexnum_system_memory_usage',
    help: 'System memory usage in bytes',
    labelNames: ['type'], // heapUsed, heapTotal, rss, etc.
    registers: [registry]
}))

export const process_cpu_usage = register('nexnum_process_cpu_usage', () => new Gauge({
    name: 'nexnum_process_cpu_usage',
    help: 'Process CPU usage percentage',
    registers: [registry]
}))

export const system_uptime = register('nexnum_system_uptime', () => new Gauge({
    name: 'nexnum_system_uptime',
    help: 'System uptime in seconds',
    registers: [registry]
}))

// --- AUTH METRICS ---

export const auth_events_total = register('nexnum_auth_events_total', () => new Counter({
    name: 'nexnum_auth_events_total',
    help: 'Total authentication events',
    labelNames: ['event', 'status'], // event: login, register, etc.
    registers: [registry]
}))

// --- LIFECYCLE MANAGER METRICS ---

export const lifecycle_jobs_total = register('nexnum_lifecycle_jobs_total', () => new Counter({
    name: 'nexnum_lifecycle_jobs_total',
    help: 'Total lifecycle jobs processed by type and result',
    labelNames: ['type', 'result'],
    registers: [registry]
}))

export const lifecycle_circuit_state = register('nexnum_lifecycle_circuit_state', () => new Gauge({
    name: 'nexnum_lifecycle_circuit_state',
    help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
    registers: [registry]
}))

export const lifecycle_job_duration = register('nexnum_lifecycle_job_duration_seconds', () => new Histogram({
    name: 'nexnum_lifecycle_job_duration_seconds',
    help: 'Duration of lifecycle job processing',
    labelNames: ['type'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry]
}))

export const lifecycle_queue_size = register('nexnum_lifecycle_queue_size', () => new Gauge({
    name: 'nexnum_lifecycle_queue_size',
    help: 'Current size of lifecycle queue by status',
    labelNames: ['status'],
    registers: [registry]
}))

// --- BATCH POLLING METRICS ---

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
    labelNames: ['provider', 'result'], // result: 'success', 'error', 'pending'
    registers: [registry]
}))

export const batch_poll_api_calls_saved = register('nexnum_batch_poll_api_calls_saved', () => new Counter({
    name: 'nexnum_batch_poll_api_calls_saved',
    help: 'API calls saved by batch polling (vs individual)',
    labelNames: ['provider'],
    registers: [registry]
}))

export const active_orders_gauge = register('nexnum_active_orders_gauge', () => new Gauge({
    name: 'nexnum_active_orders_gauge',
    help: 'Current number of active orders',
    labelNames: ['provider', 'status'],
    registers: [registry]
}))

// --- ORDER STATE MACHINE METRICS ---

export const order_state_transitions_total = register('nexnum_order_state_transitions_total', () => new Counter({
    name: 'nexnum_order_state_transitions_total',
    help: 'Total order state transitions',
    labelNames: ['from_state', 'to_state', 'provider'],
    registers: [registry]
}))

export const order_processing_duration_seconds = register('nexnum_order_processing_duration_seconds', () => new Histogram({
    name: 'nexnum_order_processing_duration_seconds',
    help: 'Duration from order creation to completion/expiry',
    labelNames: ['provider', 'final_state'],
    buckets: [10, 30, 60, 120, 300, 600, 900, 1200], // 10s to 20min
    registers: [registry]
}))

export const sms_delivery_latency_seconds = register('nexnum_sms_delivery_latency_seconds', () => new Histogram({
    name: 'nexnum_sms_delivery_latency_seconds',
    help: 'Time from number purchase to first SMS received',
    labelNames: ['provider', 'service'],
    buckets: [5, 10, 30, 60, 120, 300, 600],
    registers: [registry]
}))

// --- WALLET OPERATION METRICS ---

export const wallet_operation_duration_seconds = register('nexnum_wallet_operation_duration_seconds', () => new Histogram({
    name: 'nexnum_wallet_operation_duration_seconds',
    help: 'Duration of wallet operations',
    labelNames: ['operation'], // reserve, commit, rollback, refund
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [registry]
}))

export const wallet_balance_reserved_total = register('nexnum_wallet_balance_reserved_total', () => new Counter({
    name: 'nexnum_wallet_balance_reserved_total',
    help: 'Total amount reserved in wallet operations',
    registers: [registry]
}))

export const wallet_refunds_total = register('nexnum_wallet_refunds_total', () => new Counter({
    name: 'nexnum_wallet_refunds_total',
    help: 'Total refunds processed',
    labelNames: ['reason'], // timeout, cancelled, failed
    registers: [registry]
}))

// --- MULTI-SMS METRICS ---

export const multi_sms_sequences_total = register('nexnum_multi_sms_sequences_total', () => new Counter({
    name: 'nexnum_multi_sms_sequences_total',
    help: 'Total multi-SMS sequences processed',
    labelNames: ['provider', 'sms_count'],
    registers: [registry]
}))

// ============================================================================
// COMMAND CENTER METRICS - For Admin Dashboard and Prometheus Scraping
// ============================================================================

/**
 * HTTP Request Counter
 * Tracks all HTTP requests with labels for dashboard slicing
 */
export const http_requests_total = register('nexnum_http_requests_total', () => new Counter({
    name: 'nexnum_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['environment', 'region', 'service', 'route', 'method', 'status_code'],
    registers: [registry]
}))

/**
 * Provider Requests Counter  
 * Tracks outbound API calls to SMS providers
 */
export const provider_requests_total = register('nexnum_provider_requests_total', () => new Counter({
    name: 'nexnum_provider_requests_total',
    help: 'Total outbound provider API calls',
    labelNames: ['environment', 'region', 'service', 'provider_id', 'method', 'status_code'],
    registers: [registry]
}))

/**
 * Active Numbers Gauge
 * Current count of active number rentals
 */
export const active_numbers = register('nexnum_active_numbers', () => new Gauge({
    name: 'nexnum_active_numbers',
    help: 'Currently active number rentals',
    labelNames: ['provider_id', 'region', 'status'],
    registers: [registry]
}))

/**
 * Provider Latency Histogram
 * Response time distribution for provider API calls
 * Buckets chosen for accurate p50/p90/p99 calculation
 */
export const provider_latency = register('nexnum_provider_latency_seconds', () => new Histogram({
    name: 'nexnum_provider_latency_seconds',
    help: 'Provider API response time distribution',
    labelNames: ['provider_id', 'method', 'status_code', 'region'],
    // Buckets: 10ms to 10s covering typical API latencies
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry]
}))

/**
 * HTTP Request Latency Histogram
 * Response time distribution for all HTTP endpoints
 */
export const http_request_duration = register('nexnum_http_request_duration_seconds', () => new Histogram({
    name: 'nexnum_http_request_duration_seconds',
    help: 'HTTP request duration distribution',
    labelNames: ['route', 'method', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry]
}))

/**
 * Database Connection Pool Metrics
 */
export const db_connections = register('nexnum_db_connections', () => new Gauge({
    name: 'nexnum_db_connections',
    help: 'Database connection pool status',
    labelNames: ['state'], // active, idle, max
    registers: [registry]
}))

/**
 * Worker Queue Metrics
 */
export const worker_queue_depth = register('nexnum_worker_queue_depth', () => new Gauge({
    name: 'nexnum_worker_queue_depth',
    help: 'Current worker queue depth by state',
    labelNames: ['queue', 'state'], // state: pending, active, completed, failed
    registers: [registry]
}))

/**
 * Incident Counter
 * Tracks system incidents by severity
 */
export const incidents_total = register('nexnum_incidents_total', () => new Counter({
    name: 'nexnum_incidents_total',
    help: 'Total incidents by severity',
    labelNames: ['severity', 'type'], // severity: info, warning, critical
    registers: [registry]
}))

// ============================================================================
// HELPER FUNCTIONS - For instrumenting code paths
// ============================================================================

const ENV = process.env.NODE_ENV || 'development'
const REGION = process.env.REGION || 'default'
const SERVICE = process.env.SERVICE_NAME || 'nexnum-api'

/**
 * Track an HTTP request
 */
export function trackHttpRequest(route: string, method: string, statusCode: number) {
    http_requests_total.inc({
        environment: ENV,
        region: REGION,
        service: SERVICE,
        route,
        method,
        status_code: String(statusCode)
    })
}

/**
 * Track a provider API request with latency
 */
export function trackProviderRequest(
    providerId: string,
    method: string,
    statusCode: number,
    latencySeconds: number
) {
    provider_requests_total.inc({
        environment: ENV,
        region: REGION,
        service: SERVICE,
        provider_id: providerId,
        method,
        status_code: String(statusCode)
    })

    provider_latency.observe({
        provider_id: providerId,
        method,
        status_code: String(statusCode),
        region: REGION
    }, latencySeconds)
}

/**
 * Update active numbers count
 */
export function updateActiveNumbers(providerId: string, count: number, status: string = 'active') {
    active_numbers.set({
        provider_id: providerId,
        region: REGION,
        status
    }, count)
}

/**
 * Track HTTP request duration (for use with timer)
 */
export function trackHttpDuration(route: string, method: string, statusCode: number, durationSeconds: number) {
    http_request_duration.observe({
        route,
        method,
        status_code: String(statusCode)
    }, durationSeconds)
}

/**
 * Update database connection metrics
 */
export function updateDbConnections(active: number, idle: number, max: number) {
    db_connections.set({ state: 'active' }, active)
    db_connections.set({ state: 'idle' }, idle)
    db_connections.set({ state: 'max' }, max)
}

/**
 * Update worker queue metrics
 */
export function updateWorkerQueue(queue: string, pending: number, active: number, failed: number) {
    worker_queue_depth.set({ queue, state: 'pending' }, pending)
    worker_queue_depth.set({ queue, state: 'active' }, active)
    worker_queue_depth.set({ queue, state: 'failed' }, failed)
}

/**
 * Record an incident
 */
export function recordIncident(severity: 'info' | 'warning' | 'critical', type: string) {
    incidents_total.inc({ severity, type })
}
