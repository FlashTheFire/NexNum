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
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { getProviderAdapter } from '@/lib/providers/provider-factory'
import { logger } from '@/lib/core/logger'
import { Provider, Number as PrismaNumber } from '@prisma/client'
import {
    batch_poll_duration_seconds,
    batch_poll_items_total,
    batch_poll_api_calls_saved,
    active_orders_gauge
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

/**
 * Polling phases for orders waiting for first SMS
 * Based on SMS delivery statistics:
 * - 70% arrive within 30 seconds
 * - 90% arrive within 2 minutes  
 * - 98% arrive within 5 minutes
 */
const PRE_SMS_PHASES = {
    INITIAL: { maxAge: 30, cycle: [2, 3, 4, 5], phase: 'initial_rush' },
    EARLY: { maxAge: 120, cycle: [4, 5, 6, 7], phase: 'early_wait' },
    STANDARD: { maxAge: 300, cycle: [6, 8, 10, 8], phase: 'standard_wait' },
    EXTENDED: { maxAge: 600, cycle: [10, 12, 15, 12], phase: 'extended_wait' },
    FINAL: { maxAge: 900, cycle: [12, 15, 18, 15], phase: 'final_window' },
    LAST_CHANCE: { maxAge: 1200, cycle: [15, 20, 25, 20], phase: 'last_chance' },
}

/**
 * Polling phases for orders that already have SMS (waiting for more)
 */
const POST_SMS_PHASES = {
    IMMEDIATE: { maxAge: 30, cycle: [3, 4, 5, 4], phase: 'post_sms_immediate' },
    SHORT: { maxAge: 120, cycle: [5, 6, 7, 6], phase: 'post_sms_short' },
    STANDARD: { maxAge: 600, cycle: [8, 10, 12, 10], phase: 'post_sms_standard' },
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

    // ========================================================================
    // Adaptive Strategy
    // ========================================================================

    /**
     * Calculate the next poll delay based on order context
     */
    getNextPollDelay(context: PollContext): PollDecision {
        const { orderAgeSeconds, smsCount, pollAttempt, circuitOpen, lastPollError } = context

        // Circuit breaker open - exponential backoff
        if (circuitOpen) {
            const backoffDelay = Math.min(
                CONFIG.CIRCUIT_OPEN_DELAY_MAX,
                Math.pow(CONFIG.CIRCUIT_OPEN_DELAY_BASE, Math.min(pollAttempt, 5))
            )
            return {
                delaySeconds: backoffDelay + this.jitter(2),
                phase: 'circuit_backoff',
                useBatch: false
            }
        }

        // Error backoff
        if (lastPollError) {
            const errorDelay = Math.min(
                CONFIG.ERROR_DELAY_MAX,
                CONFIG.ERROR_DELAY_BASE + pollAttempt * 2
            )
            return {
                delaySeconds: errorDelay + this.jitter(2),
                phase: 'error_backoff',
                useBatch: true
            }
        }

        // Post-SMS polling (already have at least one SMS)
        if (smsCount > 0) {
            return this.getPostSmsDelay(context)
        }

        // Standard pre-SMS polling
        return this.getPreSmsDelay(context)
    }

    private getPreSmsDelay(context: PollContext): PollDecision {
        const { orderAgeSeconds, pollAttempt } = context

        // Find appropriate phase
        let phaseConfig = PRE_SMS_PHASES.INITIAL

        if (orderAgeSeconds > PRE_SMS_PHASES.LAST_CHANCE.maxAge) {
            phaseConfig = PRE_SMS_PHASES.LAST_CHANCE
        } else if (orderAgeSeconds > PRE_SMS_PHASES.FINAL.maxAge) {
            phaseConfig = PRE_SMS_PHASES.LAST_CHANCE
        } else if (orderAgeSeconds > PRE_SMS_PHASES.EXTENDED.maxAge) {
            phaseConfig = PRE_SMS_PHASES.FINAL
        } else if (orderAgeSeconds > PRE_SMS_PHASES.STANDARD.maxAge) {
            phaseConfig = PRE_SMS_PHASES.EXTENDED
        } else if (orderAgeSeconds > PRE_SMS_PHASES.EARLY.maxAge) {
            phaseConfig = PRE_SMS_PHASES.STANDARD
        } else if (orderAgeSeconds > PRE_SMS_PHASES.INITIAL.maxAge) {
            phaseConfig = PRE_SMS_PHASES.EARLY
        }

        const cycleIndex = pollAttempt % phaseConfig.cycle.length
        const baseDelay = phaseConfig.cycle[cycleIndex]

        return {
            delaySeconds: baseDelay + this.jitter(baseDelay * CONFIG.JITTER_RATIO),
            phase: phaseConfig.phase,
            useBatch: orderAgeSeconds > 60 // Use batch after first minute
        }
    }

    private getPostSmsDelay(context: PollContext): PollDecision {
        const { pollAttempt } = context
        const secondsSinceLastSms = pollAttempt * 5 // Rough estimate

        let phaseConfig = POST_SMS_PHASES.IMMEDIATE

        if (secondsSinceLastSms > POST_SMS_PHASES.SHORT.maxAge) {
            phaseConfig = POST_SMS_PHASES.STANDARD
        } else if (secondsSinceLastSms > POST_SMS_PHASES.IMMEDIATE.maxAge) {
            phaseConfig = POST_SMS_PHASES.SHORT
        }

        const cycleIndex = pollAttempt % phaseConfig.cycle.length
        const baseDelay = phaseConfig.cycle[cycleIndex]

        return {
            delaySeconds: baseDelay + this.jitter(baseDelay * 0.25),
            phase: phaseConfig.phase,
            useBatch: true
        }
    }

    private jitter(maxJitter: number): number {
        return Math.random() * maxJitter
    }

    // ========================================================================
    // Batch Polling
    // ========================================================================

    /**
     * Run a complete polling cycle for all active orders
     * This is the main entry point for scheduled polling
     */
    async runPollCycle(): Promise<PollCycleStats> {
        if (this.isRunning) {
            logger.warn('[UnifiedPoll] Poll cycle already running, skipping')
            return this.lastCycleStats || this.emptyStats()
        }

        this.isRunning = true
        const startTime = Date.now()
        const phaseDistribution: Record<string, number> = {}

        try {
            // 1. Get all active numbers for polling
            const items = await this.getActiveNumbersForPolling()

            if (items.length === 0) {
                this.isRunning = false
                return this.emptyStats()
            }

            // Update gauge
            active_orders_gauge.set(items.length)

            // 2. Enrich items with context and get poll decisions
            const enrichedItems = await this.enrichWithContext(items)

            // 3. Filter items that should poll now (based on adaptive strategy)
            const itemsToPolNow = enrichedItems.filter(item => {
                const decision = this.getNextPollDelay({
                    orderAgeSeconds: item.orderAgeSeconds || 0,
                    smsCount: item.smsCount || 0,
                    pollAttempt: 0,
                    circuitOpen: false
                })

                // Track phase distribution
                phaseDistribution[decision.phase] = (phaseDistribution[decision.phase] || 0) + 1

                return decision.useBatch || item.smsCount === 0
            })

            logger.info('[UnifiedPoll] Starting poll cycle', {
                totalActive: items.length,
                pollingNow: itemsToPolNow.length
            })

            // 4. Execute batch polling
            const results = await this.executeBatchPoll(itemsToPolNow)

            // 5. Calculate stats
            const smsReceived = results.filter(r => r.messages?.length > 0).length
            const errors = results.filter(r => r.error).length
            const providersPolled = new Set(itemsToPolNow.map(i => i.providerName)).size

            // Individual calls would be: items.length
            // Batch calls made: ceil(items.length / MAX_BATCH_SIZE) * providers
            const theoreticalIndividualCalls = itemsToPolNow.length
            const actualBatchCalls = Math.ceil(itemsToPolNow.length / CONFIG.MAX_BATCH_SIZE)
            const apiCallsSaved = Math.max(0, theoreticalIndividualCalls - actualBatchCalls)

            // Record metrics
            const durationMs = Date.now() - startTime
            batch_poll_duration_seconds.observe(durationMs / 1000)
            batch_poll_items_total.inc({ provider: 'all', result: 'success' }, itemsToPolNow.length - errors)
            batch_poll_items_total.inc({ provider: 'all', result: 'error' }, errors)
            batch_poll_api_calls_saved.inc(apiCallsSaved)

            this.lastCycleStats = {
                totalPolled: itemsToPolNow.length,
                providersPolled,
                smsReceived,
                errors,
                apiCallsSaved,
                durationMs,
                phaseDistribution
            }

            logger.info('[UnifiedPoll] Poll cycle complete', this.lastCycleStats)

            return this.lastCycleStats

        } catch (error: any) {
            logger.error('[UnifiedPoll] Poll cycle failed', { error: error.message })
            throw error
        } finally {
            this.isRunning = false
        }
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

                const adapter = getProviderAdapter(provider)
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
    // Data Fetching
    // ========================================================================

    async getActiveNumbersForPolling(): Promise<BatchPollItem[]> {
        const numbers = await prisma.number.findMany({
            where: {
                status: 'active',
                expiresAt: { gt: new Date() }
            },
            select: {
                id: true,
                activationId: true,
                ownerId: true,
                provider: true,
                createdAt: true,
                _count: { select: { smsMessages: true } }
            }
        })

        const providerNames = [...new Set(numbers.map(n => n.provider).filter(Boolean))]
        const providers = await prisma.provider.findMany({
            where: { name: { in: providerNames as string[] } },
            select: { id: true, name: true }
        })
        const providerMap = new Map(providers.map(p => [p.name, p.id]))

        const now = Date.now()

        return numbers
            .filter(n => n.provider && n.activationId && n.ownerId)
            .map(n => ({
                numberId: n.id,
                activationId: n.activationId!,
                userId: n.ownerId!,
                providerId: providerMap.get(n.provider!) || '',
                providerName: n.provider!,
                orderAgeSeconds: Math.floor((now - n.createdAt.getTime()) / 1000),
                smsCount: n._count?.smsMessages || 0
            }))
            .filter(item => item.providerId)
    }

    private async enrichWithContext(items: BatchPollItem[]): Promise<BatchPollItem[]> {
        // Already enriched in getActiveNumbersForPolling
        return items
    }

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
