/**
 * Synthetic End-to-End Provider Health Checker
 *
 * Periodically probes every active provider with a real (but harmless) API call
 * to verify authentication, network reachability, and that the response shape
 * matches what the adapter expects. A failed synthetic check is the earliest
 * signal that a provider is silently degraded — before user traffic notices.
 *
 * Design:
 *  - Lightweight probe: `getBalance()` is called first (no side effects, no
 *    purchase flow, no reservation). If balance is unavailable the probe
 *    classifies as DEGRADED but not DOWN.
 *  - Outcome classification:
 *      HEALTHY  — probe succeeded within latency threshold
 *      DEGRADED — probe succeeded but exceeded soft latency OR returned a
 *                 partial response (no balance but reachable)
 *      DOWN     — probe threw, timed out, or returned 5xx
 *  - Every run persists a `ProviderTestResult` row (7-day TTL) and triggers a
 *    `ProviderHealthLog` snapshot for the new Prometheus gauge.
 *  - Metrics emitted (see `src/lib/metrics.ts`):
 *      nexnum_synthetic_health_check_success{provider,action}   gauge (0/1)
 *      nexnum_synthetic_health_check_latency_seconds{...}      histogram
 *      nexnum_synthetic_health_check_runs_total{...}           counter
 */

import type { Provider } from '@prisma/client'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { getMetadataProvider } from '@/lib/providers/provider-factory'
import {
    synthetic_health_check_success,
    synthetic_health_check_latency_seconds,
    synthetic_health_check_runs_total
} from '@/lib/metrics'

export type SyntheticStatus = 'healthy' | 'degraded' | 'down'

export interface SyntheticCheckResult {
    providerId: string
    providerName: string
    action: 'getBalance'
    status: SyntheticStatus
    success: boolean
    latencyMs: number
    httpStatus?: number
    error?: string
    responseSample?: string
}

export interface SyntheticCheckerConfig {
    /** Per-provider probe timeout (ms). */
    timeoutMs: number
    /** Latency above this is considered DEGRADED (not DOWN). */
    degradedLatencyMs: number
    /** Latency above this is considered DOWN. */
    downLatencyMs: number
}

export const DEFAULT_SYNTHETIC_CONFIG: SyntheticCheckerConfig = {
    timeoutMs: 10_000,
    degradedLatencyMs: 2_000,
    downLatencyMs: 8_000
}

/**
 * Classify a raw probe outcome.
 * Exported for unit testing.
 */
export function classifyProbe(
    args: { ok: boolean; latencyMs: number; hasResponse: boolean; httpStatus?: number },
    config: SyntheticCheckerConfig = DEFAULT_SYNTHETIC_CONFIG
): SyntheticStatus {
    if (!args.ok) return 'down'
    if (args.httpStatus !== undefined && args.httpStatus >= 500) return 'down'
    if (args.latencyMs >= config.downLatencyMs) return 'down'
    if (args.latencyMs >= config.degradedLatencyMs) return 'degraded'
    if (!args.hasResponse) return 'degraded'
    return 'healthy'
}

/**
 * Run a single synthetic probe against one provider.
 * Never throws — all errors are captured into the returned result.
 */
export async function probeProvider(
    provider: Provider,
    config: SyntheticCheckerConfig = DEFAULT_SYNTHETIC_CONFIG
): Promise<SyntheticCheckResult> {
    const action = 'getBalance' as const
    const startedAt = Date.now()
    let success = false
    let httpStatus: number | undefined
    let error: string | undefined
    let responseSample: string | undefined
    let hasResponse = false

    const adapter = getMetadataProvider(provider)

    try {
        if (typeof adapter.getBalance !== 'function') {
            // No balance endpoint — degrade rather than down. The provider is
            // still reachable, the adapter just doesn't expose the probe.
            const latencyMs = Date.now() - startedAt
            const status: SyntheticStatus = 'degraded'
            await persistResult(provider.id, action, status, latencyMs, undefined, 'getBalance not implemented on adapter', undefined)
            const out: SyntheticCheckResult = {
                providerId: provider.id,
                providerName: provider.name,
                action,
                status,
                success: false,
                latencyMs,
                error: 'getBalance not implemented on adapter'
            }
            emitMetrics(out)
            return out
        }

        const result = await withTimeout(adapter.getBalance(), config.timeoutMs, 'synthetic-balance-timeout')
        const latencyMs = Date.now() - startedAt
        success = true
        hasResponse = result !== undefined && result !== null
        responseSample = truncate(hasResponse ? String(result) : '', 256)

        const status = classifyProbe({ ok: true, latencyMs, hasResponse }, config)
        await persistResult(provider.id, action, status, latencyMs, 200, undefined, responseSample)
        const out: SyntheticCheckResult = { providerId: provider.id, providerName: provider.name, action, status, success: true, latencyMs, httpStatus: 200, responseSample }
        emitMetrics(out)
        return out
    } catch (e: any) {
        const latencyMs = Date.now() - startedAt
        const status: SyntheticStatus = 'down'
        error = e?.message ?? String(e)
        // Heuristic: axios-like errors carry .response.status
        if (e?.response?.status) httpStatus = Number(e.response.status)
        if (e?.status) httpStatus = Number(e.status)

        await persistResult(provider.id, action, status, latencyMs, httpStatus, error, responseSample)
        const out: SyntheticCheckResult = { providerId: provider.id, providerName: provider.name, action, status, success: false, latencyMs, httpStatus, error }
        emitMetrics(out)
        return out
    }
}

async function persistResult(
    providerId: string,
    action: string,
    status: SyntheticStatus,
    latencyMs: number,
    httpStatus: number | undefined,
    error: string | undefined,
    responseSample: string | undefined
): Promise<void> {
    try {
        await prisma.providerTestResult.create({
            data: {
                providerId,
                action,
                success: status !== 'down',
                httpStatus: httpStatus ?? null,
                responseTime: latencyMs,
                requestUrl: null,
                responseData: responseSample ?? null,
                error: error ?? null
            }
        })

        if (status === 'down') {
            // Only persist a snapshot for non-healthy transitions to keep the
            // health log table compact (the monitor-health cron already writes
            // periodic healthy rows for active providers).
            await prisma.providerHealthLog.create({
                data: {
                    providerId,
                    status,
                    successRate: 0,
                    avgLatency: latencyMs,
                    errorCount: 1
                }
            })
        }
    } catch (e: any) {
        // Persistence is best-effort; never let a DB failure mask a probe outcome.
        logger.warn('Failed to persist synthetic health result', {
            providerId,
            action,
            error: e?.message
        })
    }
}

/**
 * Run synthetic probes for every active provider in parallel.
 * Returns a structured per-provider report.
 */
export async function runSyntheticHealthCheck(
    config: SyntheticCheckerConfig = DEFAULT_SYNTHETIC_CONFIG
): Promise<{ results: SyntheticCheckResult[]; summary: { healthy: number; degraded: number; down: number; total: number } }> {
    const providers = await prisma.provider.findMany({
        where: { isActive: true },
        select: { id: true, name: true, isActive: true }
    })

    if (providers.length === 0) {
        logger.info('No active providers to probe', { context: 'SYNTHETIC_HEALTH' })
        return { results: [], summary: { healthy: 0, degraded: 0, down: 0, total: 0 } }
    }

    // Full Provider rows are required for the adapter; refetch.
    const fullProviders = await prisma.provider.findMany({
        where: { id: { in: providers.map(p => p.id) } }
    })

    logger.info(`Starting synthetic health check for ${fullProviders.length} providers`, { context: 'SYNTHETIC_HEALTH' })

    const results = await Promise.all(
        fullProviders.map(async (p) => {
            return probeProvider(p, config)
        })
    )

    const summary = {
        healthy: results.filter(r => r.status === 'healthy').length,
        degraded: results.filter(r => r.status === 'degraded').length,
        down: results.filter(r => r.status === 'down').length,
        total: results.length
    }

    logger.info('Synthetic health check complete', { context: 'SYNTHETIC_HEALTH', ...summary })
    return { results, summary }
}

function emitMetrics(r: SyntheticCheckResult): void {
    const labels = { provider: r.providerName, action: r.action }
    try {
        synthetic_health_check_success.set(labels, r.success ? 1 : 0)
        synthetic_health_check_latency_seconds.observe(labels, r.latencyMs / 1000)
        synthetic_health_check_runs_total.inc({ ...labels, outcome: r.status })
    } catch (e: any) {
        logger.warn('Failed to emit synthetic health metrics', { error: e?.message })
    }
}

/** Race a promise against a timeout; rejects with a tagged error on expiry. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms)
    })
    try {
        return await Promise.race([p, timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

function truncate(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n - 1) + '…'
}
