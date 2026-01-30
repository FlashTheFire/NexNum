/**
 * Unified Poll Manager
 * 
 * Production-ready SMS polling engine that combines:
 * - Adaptive polling (phase-based intervals + jitter)
 * - Batch polling (provider grouping + chunking)
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                      UnifiedPollManager                             │
 * │                                                                     │
 * │  ┌─────────────────────────┐    ┌────────────────────────────────┐ │
 * │  │   Adaptive Strategy     │    │      Batch Executor            │ │
 * │  │                         │    │                                │ │
 * │  │  • 6 pre-SMS phases     │    │  • Group by provider           │ │
 * │  │  • 3 post-SMS phases    │    │  • Chunk into batches          │ │
 * │  │  • ±30% jitter          │    │  • Parallel execution          │ │
 * │  │  • Circuit breaker      │    │  • Fallback to individual      │ │
 * │  └─────────────────────────┘    └────────────────────────────────┘ │
 * │                                                                     │
 * │  ┌─────────────────────────┐    ┌────────────────────────────────┐ │
 * │  │   Metrics & Observability│   │      Health Monitoring         │ │
 * │  │                         │    │                                │ │
 * │  │  • Poll duration        │    │  • Active orders count         │ │
 * │  │  • API calls saved      │    │  • Batch efficiency            │ │
 * │  │  • Items per batch      │    │  • Error rates                 │ │
 * │  │  • Provider breakdown   │    │  • Phase distribution          │ │
 * │  └─────────────────────────┘    └────────────────────────────────┘ │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { prisma } from '@/lib/core/db'
import { redis, REDIS_KEYS } from '@/lib/core/redis'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { getProviderAdapter } from '@/lib/providers/provider-factory'
import { logger } from '@/lib/core/logger'
import { Provider } from '@prisma/client'
import { AdaptivePollStrategy } from './adaptive-poll-strategy'
import {
    batch_poll_duration_seconds,
    batch_poll_items_total,
    batch_poll_api_calls_saved,
    active_orders_gauge,
} from '@/lib/metrics'

// ============================================================================
// Types
// ============================================================================

export interface PollContext {
    /** Seconds since order was created */
    orderAgeSeconds: number
    /** Number of SMS messages already received */
    smsCount: number
    /** Current poll attempt number (0-based) */
    pollAttempt: number
    /** Whether the circuit breaker is open */
    circuitOpen?: boolean
    /** Last poll had an error */
    lastPollError?: boolean
}

export interface PollDecision {
    /** Seconds until next poll */
    delaySeconds: number
    /** Description for logging */
    phase: string
    /** Whether to use batch polling */
    useBatch: boolean
}

export interface BatchPollItem {
    numberId: string
    activationId: string
    userId: string
    providerId: string
    providerName: string
    orderAgeSeconds?: number
    smsCount?: number
    pollAttempt: number
}

export interface BatchPollResult {
    activationId: string
    numberId: string
    status: string
    messages: Array<{ code?: string; text?: string; content?: string }>
    error?: string
    phase?: string
}

interface ProviderBatch {
    provider: Provider
    items: BatchPollItem[]
}

export interface PollCycleStats {
    totalPolled: number
    providersPolled: number
    smsReceived: number
    errors: number
    apiCallsSaved: number
    durationMs: number
    phaseDistribution: Record<string, number>
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    // Batch settings
    MAX_BATCH_SIZE: 20,
    MAX_PARALLEL_BATCHES: 3,
    BATCH_TIMEOUT_MS: 10000,
    BATCH_THRESHOLD: 5,

    // Circuit breaker
    CIRCUIT_OPEN_DELAY_BASE: 2,
    CIRCUIT_OPEN_DELAY_MAX: 30,

    // Error backoff
    ERROR_DELAY_BASE: 5,
    ERROR_DELAY_MAX: 20,

    // Jitter
    JITTER_RATIO: 0.3,
}

// ============================================================================
// Unified Poll Manager
// ============================================================================

export class UnifiedPollManager {
    private static instance: UnifiedPollManager
    private isRunning = false
    private lastCycleStats: PollCycleStats | null = null

    private constructor() { }

    static getInstance(): UnifiedPollManager {
        if (!UnifiedPollManager.instance) {
            UnifiedPollManager.instance = new UnifiedPollManager()
        }
        return UnifiedPollManager.instance
    }

    /**
     * Backward compatibility wrapper for adaptive polling logic
     */
    getNextPollDelay(context: PollContext): PollDecision {
        return AdaptivePollStrategy.getNextPollDelay(context)
    }

    // ========================================================================
    // Adaptive Strategy (now delegated to AdaptivePollStrategy)
    // ========================================================================

    /**
     * Run a complete polling cycle for all active orders
     * This is the main entry point for scheduled polling
     */
    async runPollCycle(): Promise<PollCycleStats> {
        if (this.isRunning) return this.emptyStats()

        // 1. Distributed Lock to prevent parallel cycles in cluster
        const lockKey = REDIS_KEYS.idempotency('poll_cycle_lock')
        const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX')
        if (!acquired) return this.emptyStats()

        this.isRunning = true
        const startTime = Date.now()
        const phaseDistribution: Record<string, number> = {}

        try {
            // 2. Fetch Due Activations from Redis Index
            const now = Date.now()
            const pollIndex = REDIS_KEYS.pollingIndex()
            const dueActivations = await redis.zrangebyscore(pollIndex, '-inf', now)

            if (dueActivations.length === 0) {
                active_orders_gauge.set(0)
                return this.emptyStats()
            }

            // 3. Batch Fetch Activation Details from DB
            const items = await this.fetchActivationDetails(dueActivations)
            active_orders_gauge.set(items.length)

            logger.info(`[UnifiedPoll:Redis] Starting cycle for ${items.length} due items`, {
                totalDue: dueActivations.length,
                dbMatched: items.length
            })

            // 4. Group & Execute Polling
            const results = await this.executeBatchPoll(items)

            // 5. Post-Process Results (Reschedule or Complete)
            await this.finalizePolling(items, results, phaseDistribution)

            // 6. Metrics & Cleanup
            const durationMs = Date.now() - startTime
            return this.recordCycleMetrics(items, results, durationMs, phaseDistribution)

        } catch (error: any) {
            logger.error('[UnifiedPoll] Cycle critical failure', { error: error.message })
            throw error
        } finally {
            await redis.del(lockKey)
            this.isRunning = false
        }
    }

    /**
     * Professional Activation Detail Fetcher
     */
    private async fetchActivationDetails(ids: string[]): Promise<BatchPollItem[]> {
        const activations = await prisma.activation.findMany({
            where: { id: { in: ids }, state: { in: ['ACTIVE', 'RECEIVED'] } },
            include: {
                _count: { select: { history: true } } // Approximate poll attempts via history
            }
        })

        const providerNames = [...new Set(activations.map(a => a.providerId).filter(Boolean))]
        const providers = await prisma.provider.findMany({
            where: { id: { in: providerNames as string[] } }
        })
        const providerMap = new Map(providers.map(p => [p.id, p]))

        return activations.map(a => {
            const provider = providerMap.get(a.providerId || '')
            return {
                activationId: a.id,
                numberId: a.phoneNumber || '',
                userId: a.userId,
                providerId: a.providerId || '',
                providerName: provider?.name || 'unknown',
                orderAgeSeconds: Math.floor((Date.now() - a.createdAt.getTime()) / 1000),
                smsCount: 0, // Should fetch real count from messages table if post-sms
                pollAttempt: a._count?.history || 0
            }
        })
    }

    /**
     * High-Precision Rescheduling Logic
     */
    private async finalizePolling(
        items: BatchPollItem[],
        results: BatchPollResult[],
        phaseDist: Record<string, number>
    ) {
        const pollIndex = REDIS_KEYS.pollingIndex()
        const pipeline = redis.pipeline()

        for (const item of items) {
            const result = results.find(r => r.activationId === item.activationId)

            // If SMS received, we might poll more (post-sms) or terminal
            const shouldStop = result?.status === 'received' || result?.status === 'refunded'

            if (shouldStop) {
                pipeline.zrem(pollIndex, item.activationId)
                continue
            }

            // Calculate next poll via StateEngine
            const nextPollCount = item.pollAttempt + 1
            const nextPollTime = AdaptivePollStrategy.getNextPollTime(nextPollCount)

            pipeline.zadd(pollIndex, nextPollTime.getTime(), item.activationId)

            // Track distribution
            const phase = AdaptivePollStrategy.getPhaseInfo(nextPollCount)?.name || 'unknown'
            phaseDist[phase] = (phaseDist[phase] || 0) + 1
        }

        await pipeline.exec()
    }

    /**
     * Execute batch polling for given items
     */
    private async executeBatchPoll(items: BatchPollItem[]): Promise<BatchPollResult[]> {
        if (items.length === 0) return []

        // Below threshold - use individual polling
        if (items.length < CONFIG.BATCH_THRESHOLD) {
            return this.pollIndividual(items)
        }

        // 1. Group by provider
        const providerBatches = await this.groupByProvider(items)

        // 2. Process each provider in parallel
        const results = await Promise.all(
            providerBatches.map(batch => this.processProviderBatch(batch))
        )

        return results.flat()
    }

    private async groupByProvider(items: BatchPollItem[]): Promise<ProviderBatch[]> {
        const providerIds = [...new Set(items.map(i => i.providerId))]

        const providers = await prisma.provider.findMany({
            where: { id: { in: providerIds } }
        })

        const batches: ProviderBatch[] = []

        for (const provider of providers) {
            const providerItems = items.filter(i => i.providerId === provider.id)
            if (providerItems.length > 0) {
                batches.push({ provider, items: providerItems })
            }
        }

        return batches
    }

    private async processProviderBatch(batch: ProviderBatch): Promise<BatchPollResult[]> {
        const { provider, items } = batch

        logger.debug('[UnifiedPoll] Processing provider batch', {
            provider: provider.name,
            itemCount: items.length
        })

        const adapter = getProviderAdapter(provider)
        const supportsBatch = 'getStatusBatch' in adapter

        if (supportsBatch && items.length >= CONFIG.BATCH_THRESHOLD) {
            return this.pollProviderBatch(provider, items, adapter as any)
        } else {
            return this.pollProviderIndividual(provider, items, adapter)
        }
    }

    private async pollProviderBatch(
        provider: Provider,
        items: BatchPollItem[],
        adapter: { getStatusBatch: (ids: string[]) => Promise<Map<string, any>> }
    ): Promise<BatchPollResult[]> {
        const results: BatchPollResult[] = []
        const chunks = this.chunkArray(items, CONFIG.MAX_BATCH_SIZE)

        for (let i = 0; i < chunks.length; i += CONFIG.MAX_PARALLEL_BATCHES) {
            const parallelChunks = chunks.slice(i, i + CONFIG.MAX_PARALLEL_BATCHES)

            const chunkResults = await Promise.all(
                parallelChunks.map(async (chunk) => {
                    const activationIds = chunk.map(item => item.activationId)

                    try {
                        const statusMap = await Promise.race([
                            adapter.getStatusBatch(activationIds),
                            this.timeout(CONFIG.BATCH_TIMEOUT_MS)
                        ]) as Map<string, any>

                        return chunk.map(item => ({
                            activationId: item.activationId,
                            numberId: item.numberId,
                            status: statusMap.get(item.activationId)?.status || 'unknown',
                            messages: statusMap.get(item.activationId)?.messages || [],
                        }))
                    } catch (error: any) {
                        logger.error('[UnifiedPoll] Batch request failed', {
                            provider: provider.name,
                            error: error.message,
                            chunkSize: chunk.length
                        })

                        return chunk.map(item => ({
                            activationId: item.activationId,
                            numberId: item.numberId,
                            status: 'error',
                            messages: [],
                            error: error.message
                        }))
                    }
                })
            )

            results.push(...chunkResults.flat())
        }

        return results
    }

    private async pollProviderIndividual(
        provider: Provider,
        items: BatchPollItem[],
        adapter: any
    ): Promise<BatchPollResult[]> {
        const results = await Promise.allSettled(
            items.map(async (item) => {
                const status = await adapter.getStatus(item.activationId)
                return {
                    activationId: item.activationId,
                    numberId: item.numberId,
                    status: status?.status || 'unknown',
                    messages: status?.messages || [],
                }
            })
        )

        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value
            } else {
                return {
                    activationId: items[index].activationId,
                    numberId: items[index].numberId,
                    status: 'error',
                    messages: [],
                    error: result.reason?.message || 'Unknown error'
                }
            }
        })
    }

    private async pollIndividual(items: BatchPollItem[]): Promise<BatchPollResult[]> {
        const results = await Promise.allSettled(
            items.map(async (item) => {
                const provider = await prisma.provider.findUnique({
                    where: { id: item.providerId }
                })

                if (!provider) {
                    throw new Error(`Provider ${item.providerId} not found`)
                }

                if (!item.activationId) {
                    throw new Error(`Activation ID missing for number ${item.numberId}`)
                }

                const adapter = getProviderAdapter(provider)
                if (!adapter.getStatus) {
                    throw new Error(`Provider ${provider.name} does not support getStatus`)
                }
                const status = await adapter.getStatus(item.activationId)

                return {
                    activationId: item.activationId,
                    numberId: item.numberId,
                    status: status?.status || 'unknown',
                    messages: status?.messages || [],
                }
            })
        )

        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value
            } else {
                return {
                    activationId: items[index].activationId,
                    numberId: items[index].numberId,
                    status: 'error',
                    messages: [],
                    error: result.reason?.message || 'Unknown error'
                }
            }
        })
    }

    // ========================================================================
    // Data Fetching (now handled by fetchActivationDetails)
    // ========================================================================

    // ========================================================================
    // Utilities
    // ========================================================================

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = []
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size))
        }
        return chunks
    }

    private timeout(ms: number): Promise<never> {
        return new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
        )
    }

    private emptyStats(): PollCycleStats {
        return {
            totalPolled: 0,
            providersPolled: 0,
            smsReceived: 0,
            errors: 0,
            apiCallsSaved: 0,
            durationMs: 0,
            phaseDistribution: {}
        }
    }

    private recordCycleMetrics(
        items: BatchPollItem[],
        results: BatchPollResult[],
        durationMs: number,
        phaseDist: Record<string, number>
    ): PollCycleStats {
        const smsReceived = results.filter(r => r.messages?.length > 0).length
        const errors = results.filter(r => r.error).length
        const apiCallsSaved = Math.max(0, items.length - Math.ceil(items.length / CONFIG.MAX_BATCH_SIZE))

        batch_poll_duration_seconds.observe(durationMs / 1000)
        batch_poll_items_total.inc({ provider: 'all', result: 'success' }, items.length - errors)
        batch_poll_api_calls_saved.inc(apiCallsSaved)

        this.lastCycleStats = {
            totalPolled: items.length,
            providersPolled: new Set(items.map(i => i.providerName)).size,
            smsReceived,
            errors,
            apiCallsSaved,
            durationMs,
            phaseDistribution: phaseDist
        }

        return this.lastCycleStats
    }

    // ========================================================================
    // Health & Status
    // ========================================================================

    getLastCycleStats(): PollCycleStats | null {
        return this.lastCycleStats
    }

    isPolling(): boolean {
        return this.isRunning
    }

    /**
     * Get human-readable strategy description
     */
    describeStrategy(): string {
        return `
╔═══════════════════════════════════════════════════════════════════════════╗
║                        UNIFIED POLL MANAGER                               ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  ADAPTIVE STRATEGY                    BATCH EXECUTOR                      ║
║  ─────────────────                    ──────────────                      ║
║  • 6 pre-SMS phases                   • Group by provider                 ║
║  • 3 post-SMS phases                  • ${CONFIG.MAX_BATCH_SIZE} items per batch           ║
║  • ±${Math.round(CONFIG.JITTER_RATIO * 100)}% jitter                         • ${CONFIG.MAX_PARALLEL_BATCHES} parallel batches              ║
║  • Circuit breaker backoff            • Individual fallback               ║
║                                                                           ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                           ║
║  PRE-SMS PHASES (Waiting for first SMS):                                  ║
║  ┌────────────────┬─────────────────┬──────────────────────┐              ║
║  │ Order Age      │ Poll Cycle      │ Phase                │              ║
║  ├────────────────┼─────────────────┼──────────────────────┤              ║
║  │ 0 - 30s        │ [2, 3, 4, 5]s   │ Initial Rush         │              ║
║  │ 30s - 2min     │ [4, 5, 6, 7]s   │ Early Wait           │              ║
║  │ 2min - 5min    │ [6, 8, 10, 8]s  │ Standard Wait        │              ║
║  │ 5min - 10min   │ [10, 12, 15]s   │ Extended Wait        │              ║
║  │ 10min - 15min  │ [12, 15, 18]s   │ Final Window         │              ║
║  │ 15min - 20min  │ [15, 20, 25]s   │ Last Chance          │              ║
║  └────────────────┴─────────────────┴──────────────────────┘              ║
║                                                                           ║
║  POST-SMS PHASES (After receiving SMS, waiting for more):                 ║
║  ┌────────────────┬─────────────────┬──────────────────────┐              ║
║  │ Time Since SMS │ Poll Cycle      │ Phase                │              ║
║  ├────────────────┼─────────────────┼──────────────────────┤              ║
║  │ 0 - 30s        │ [3, 4, 5, 4]s   │ Post-SMS Immediate   │              ║
║  │ 30s - 2min     │ [5, 6, 7, 6]s   │ Post-SMS Short       │              ║
║  │ 2min+          │ [8, 10, 12]s    │ Post-SMS Standard    │              ║
║  └────────────────┴─────────────────┴──────────────────────┘              ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
        `.trim()
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const unifiedPollManager = UnifiedPollManager.getInstance()

// ============================================================================
// Convenience Functions
// ============================================================================

export function getNextPollDelay(context: PollContext): PollDecision {
    return unifiedPollManager.getNextPollDelay(context)
}

export async function runPollCycle(): Promise<PollCycleStats> {
    return unifiedPollManager.runPollCycle()
}

export function describePollStrategy(): string {
    return unifiedPollManager.describeStrategy()
}
