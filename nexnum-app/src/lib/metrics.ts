/**
 * Prometheus Metrics - Core Operational Visibility
 * 
 * 4 Critical Metrics:
 * 1. outbox_lag_seconds - Detect indexing failure
 * 2. outbox_pending_count - Backlog visibility
 * 3. buy_success_rate - Revenue health
 * 4. meili_query_p95 - Search UX
 */

import { Registry, Gauge, Counter, Histogram, collectDefaultMetrics } from 'prom-client'

// Create a new registry to avoid conflicts
export const metricsRegistry = new Registry()

// Add default Node.js metrics (CPU, memory, etc.)
collectDefaultMetrics({ register: metricsRegistry })

// ============================================
// OUTBOX METRICS
// ============================================

export const outboxLagSeconds = new Gauge({
    name: 'nexnum_outbox_lag_seconds',
    help: 'How old is the oldest unprocessed outbox event',
    registers: [metricsRegistry]
})

export const outboxPendingCount = new Gauge({
    name: 'nexnum_outbox_pending_count',
    help: 'Number of unprocessed outbox events',
    registers: [metricsRegistry]
})

export const outboxProcessedTotal = new Counter({
    name: 'nexnum_outbox_processed_total',
    help: 'Total outbox events processed',
    labelNames: ['status'], // success, failed
    registers: [metricsRegistry]
})

// ============================================
// PURCHASE METRICS
// ============================================

export const buyRequestsTotal = new Counter({
    name: 'nexnum_buy_requests_total',
    help: 'Total buy requests',
    labelNames: ['status'], // success, failed, out_of_stock, insufficient_balance
    registers: [metricsRegistry]
})

export const buyLatencySeconds = new Histogram({
    name: 'nexnum_buy_latency_seconds',
    help: 'Buy request latency in seconds',
    buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [metricsRegistry]
})

// Derived metric: success rate = success / total
// This is computed at query time in Prometheus/Grafana

// ============================================
// MEILISEARCH METRICS
// ============================================

export const meiliQueryLatencySeconds = new Histogram({
    name: 'nexnum_meili_query_seconds',
    help: 'MeiliSearch query latency in seconds',
    labelNames: ['operation'], // search_services, search_countries, search_offers
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [metricsRegistry]
})

export const meiliIndexingDurationSeconds = new Histogram({
    name: 'nexnum_meili_indexing_seconds',
    help: 'MeiliSearch indexing duration in seconds',
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
    registers: [metricsRegistry]
})

// ============================================
// SYNC METRICS
// ============================================

export const syncDurationSeconds = new Histogram({
    name: 'nexnum_sync_duration_seconds',
    help: 'Provider sync duration in seconds',
    labelNames: ['provider'],
    buckets: [10, 30, 60, 120, 300, 600],
    registers: [metricsRegistry]
})

export const syncOffersTotal = new Gauge({
    name: 'nexnum_sync_offers_total',
    help: 'Total offers synced per provider',
    labelNames: ['provider'],
    registers: [metricsRegistry]
})

// ============================================
// RESERVATION METRICS
// ============================================

export const reservationsPendingCount = new Gauge({
    name: 'nexnum_reservations_pending_count',
    help: 'Number of pending reservations',
    registers: [metricsRegistry]
})

export const reservationsExpiredTotal = new Counter({
    name: 'nexnum_reservations_expired_total',
    help: 'Total reservations that expired',
    registers: [metricsRegistry]
})

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Update outbox metrics from current state
 */
export async function updateOutboxMetrics(stats: { pending: number; oldestEventAge?: number }) {
    outboxPendingCount.set(stats.pending)
    if (stats.oldestEventAge !== undefined) {
        outboxLagSeconds.set(stats.oldestEventAge)
    }
}

/**
 * Record a buy attempt
 */
export function recordBuyAttempt(status: 'success' | 'failed' | 'out_of_stock' | 'insufficient_balance', durationMs: number) {
    buyRequestsTotal.inc({ status })
    buyLatencySeconds.observe(durationMs / 1000)
}

/**
 * Record a MeiliSearch query
 */
export function recordMeiliQuery(operation: string, durationMs: number) {
    meiliQueryLatencySeconds.observe({ operation }, durationMs / 1000)
}

/**
 * Record sync completion
 */
export function recordSyncComplete(provider: string, durationMs: number, offerCount: number) {
    syncDurationSeconds.observe({ provider }, durationMs / 1000)
    syncOffersTotal.set({ provider }, offerCount)
}

/**
 * Get all metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
    return metricsRegistry.metrics()
}

/**
 * Get content type for metrics endpoint
 */
export function getMetricsContentType(): string {
    return metricsRegistry.contentType
}
