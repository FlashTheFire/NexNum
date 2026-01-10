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
