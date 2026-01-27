/**
 * Batch Poll Manager
 * 
 * Groups SMS status polls by provider to reduce API calls.
 * Instead of 1000 individual getStatus() calls, we make ~50 batch calls.
 * 
 * Benefits:
 * - 20x reduction in API calls to providers
 * - Better rate limit management
 * - Reduced latency through parallelization
 * - Less load on provider systems = better relationship
 */

import { prisma } from '@/lib/core/db'
import { getProviderAdapter } from '@/lib/providers/provider-factory'
import { logger } from '@/lib/core/logger'
import { Provider } from '@prisma/client'
import { PredictiveThrottler } from './predictive-throttler'

// ============================================================================
// Types
// ============================================================================

export interface BatchPollItem {
    numberId: string
    activationId: string
    userId: string
    providerId: string
    providerName: string
}

export interface BatchPollResult {
    activationId: string
    numberId: string
    status: string
    messages: Array<{ code?: string; text?: string; content?: string }>
    error?: string
}

interface ProviderBatch {
    provider: Provider
    items: BatchPollItem[]
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    // Maximum items per batch request (provider-dependent)
    MAX_BATCH_SIZE: 20,

    // Maximum parallel batches per provider
    MAX_PARALLEL_BATCHES: 3,

    // Timeout for batch request
    BATCH_TIMEOUT_MS: 10000,

    // Minimum items to trigger batch mode (otherwise use individual)
    BATCH_THRESHOLD: 5,
}

// ============================================================================
// Batch Poll Manager
// ============================================================================

export class BatchPollManager {

    /**
     * Poll multiple numbers in batches grouped by provider
     * 
     * @param items - Array of numbers to poll
     * @returns Array of poll results
     */
    static async pollBatch(items: BatchPollItem[]): Promise<BatchPollResult[]> {
        if (items.length === 0) return []

        // If below threshold, use individual polling (simpler)
        if (items.length < CONFIG.BATCH_THRESHOLD) {
            return this.pollIndividual(items)
        }

        const startTime = Date.now()
        logger.info('[BatchPoll] Starting batch poll', { itemCount: items.length })

        // 1. Group items by provider
        const providerBatches = await this.groupByProvider(items)

        // 2. Process each provider's batches in parallel
        const results = await Promise.all(
            providerBatches.map(batch => this.processProviderBatch(batch))
        )

        // 3. Flatten results
        const flatResults = results.flat()

        const duration = Date.now() - startTime
        logger.info('[BatchPoll] Batch poll complete', {
            itemCount: items.length,
            providerCount: providerBatches.length,
            resultCount: flatResults.length,
            durationMs: duration
        })

        return flatResults
    }

    /**
     * Group poll items by their provider
     */
    private static async groupByProvider(items: BatchPollItem[]): Promise<ProviderBatch[]> {
        // Get unique provider IDs
        const providerIds = [...new Set(items.map(i => i.providerId))]

        // Fetch provider configs
        const providers = await prisma.provider.findMany({
            where: { id: { in: providerIds } }
        })

        const providerMap = new Map(providers.map(p => [p.id, p]))

        // Group items by provider
        const batches: ProviderBatch[] = []

        for (const provider of providers) {
            const providerItems = items.filter(i => i.providerId === provider.id)
            if (providerItems.length > 0) {
                batches.push({ provider, items: providerItems })
            }
        }

        return batches
    }

    /**
     * Process all items for a single provider
     * Handles chunking and parallel execution
     */
    private static async processProviderBatch(batch: ProviderBatch): Promise<BatchPollResult[]> {
        const { provider, items } = batch

        logger.debug('[BatchPoll] Processing provider batch', {
            provider: provider.name,
            itemCount: items.length
        })

        // Check if provider supports batch status
        const adapter = getProviderAdapter(provider)
        const supportsBatch = 'getStatusBatch' in adapter

        if (supportsBatch && items.length >= CONFIG.BATCH_THRESHOLD) {
            // Use batch API
            return this.pollProviderBatch(provider, items, adapter as any)
        } else {
            // Fallback to parallel individual calls
            return this.pollProviderIndividual(provider, items, adapter)
        }
    }

    /**
     * Poll using provider's batch API (if available)
     */
    private static async pollProviderBatch(
        provider: Provider,
        items: BatchPollItem[],
        adapter: { getStatusBatch: (ids: string[]) => Promise<Map<string, any>> }
    ): Promise<BatchPollResult[]> {
        const results: BatchPollResult[] = []

        // 1. Chunk items into batches
        const chunks = this.chunkArray(items, CONFIG.MAX_BATCH_SIZE)

        // 2. Determine Optimal Parallelism based on provider health
        const maxParallel = await PredictiveThrottler.getOptimalParallelism(provider.id)

        // 3. Process chunks with limited parallelism
        for (let i = 0; i < chunks.length; i += maxParallel) {
            const parallelChunks = chunks.slice(i, i + maxParallel)

            const chunkResults = await Promise.all(
                parallelChunks.map(async (chunk) => {
                    const activationIds = chunk.map(item => item.activationId)
                    const startTime = Date.now()

                    try {
                        const statusMap = await adapter.getStatusBatch(activationIds)
                        const latency = Date.now() - startTime

                        // Record success metrics
                        PredictiveThrottler.recordMetrics(provider.id, latency, true)

                        return chunk.map(item => ({
                            activationId: item.activationId,
                            numberId: item.numberId,
                            status: statusMap.get(item.activationId)?.status || 'unknown',
                            messages: statusMap.get(item.activationId)?.messages || [],
                        }))
                    } catch (error: any) {
                        const latency = Date.now() - startTime
                        PredictiveThrottler.recordMetrics(provider.id, latency, false)

                        logger.error('[BatchPoll] Batch request failed', {
                            provider: provider.name,
                            error: error.message,
                            chunkSize: chunk.length
                        })

                        // Return error results for this chunk
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

    /**
     * Poll using individual calls (fallback)
     */
    private static async pollProviderIndividual(
        provider: Provider,
        items: BatchPollItem[],
        adapter: any
    ): Promise<BatchPollResult[]> {
        // Use Promise.allSettled for resilience
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

    /**
     * Simple individual polling (for small batches)
     */
    private static async pollIndividual(items: BatchPollItem[]): Promise<BatchPollResult[]> {
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

    /**
     * Utility: Split array into chunks
     */
    private static chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = []
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size))
        }
        return chunks
    }
}

/**
 * Get all active numbers that need polling
 * Groups by provider for efficient batch processing
 */
export async function getActiveNumbersForPolling(): Promise<BatchPollItem[]> {
    // 1. Get active numbers
    const numbers = await prisma.number.findMany({
        where: {
            status: 'active',
            expiresAt: { gt: new Date() }
        },
        select: {
            id: true,
            activationId: true,
            ownerId: true,
            provider: true  // This is a string field (provider name)
        }
    })

    // 2. Get unique provider names and fetch their configs
    const providerNames = [...new Set(numbers.map(n => n.provider).filter(Boolean))]
    const providers = await prisma.provider.findMany({
        where: { name: { in: providerNames as string[] } },
        select: { id: true, name: true }
    })
    const providerMap = new Map(providers.map(p => [p.name, p.id]))

    // 3. Map numbers to BatchPollItems
    return numbers
        .filter(n => n.provider && n.activationId && n.ownerId)
        .map(n => ({
            numberId: n.id,
            activationId: n.activationId!,
            userId: n.ownerId!,
            providerId: providerMap.get(n.provider!) || '',
            providerName: n.provider!
        }))
        .filter(item => item.providerId) // Only items with valid provider
}
