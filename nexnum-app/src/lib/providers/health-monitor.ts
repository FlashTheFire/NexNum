/**
 * Provider Health Monitor
 * 
 * Tracks provider health with:
 * - Circuit breaker pattern
 * - Success rate tracking (sliding window)
 * - Latency monitoring
 * - Automatic recovery
 */

import { redis } from '@/lib/core/redis'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { ProviderHealth } from '@/lib/sms/types'
import {
    provider_health_success_rate,
    provider_health_status,
    provider_health_latency_avg
} from '@/lib/metrics'

// --- Phase 25: Memory Caching ---
const healthCache = new Map<string, { data: ProviderHealth; expires: number }>()
const CACHE_TTL = 5000 // 5 seconds

// ============================================
// CIRCUIT BREAKER CONFIG
// ============================================

interface CircuitBreakerConfig {
    /**  Failures before opening circuit */
    failureThreshold: number

    /** Success rate threshold (0-1) */
    successRateThreshold: number

    /** Time window for success rate (seconds) */
    window: number

    /** How long circuit stays open (ms) */
    openDuration: number

    /** Requests in half-open state */
    halfOpenRequests: number
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    successRateThreshold: 0.7, // 70%
    window: 60, // 1 minute
    openDuration: 30000, // 30 seconds
    halfOpenRequests: 3,
}

// ============================================
// HEALTH MONITOR CLASS
// ============================================

export class HealthMonitor {
    private config: CircuitBreakerConfig

    constructor(config?: Partial<CircuitBreakerConfig>) {
        this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config }
    }

    /**
     * Record a request (success or failure)
     */
    async recordRequest(
        providerId: string,
        success: boolean,
        latency?: number,
        country?: string | number,
        errorType?: 'SYSTEMIC' | 'TRANSIENT' | 'TIMEOUT'
    ): Promise<void> {
        const now = Date.now()
        const countryKey = country ? String(country) : 'GLOBAL'

        // Store in Redis sorted set (score = timestamp)
        // If latency is undefined, we store 0 or skip? We store 0 for shape consistency but won't use it for stats if guarded.
        const storedLatency = latency || 0

        const globalKey = `health:${providerId}:requests`
        const facetKey = `health:${providerId}:${countryKey}:requests`

        const payload = JSON.stringify({
            success,
            latency: storedLatency,
            timestamp: now,
        })

        await Promise.all([
            redis.zadd(globalKey, now, payload),
            redis.zadd(facetKey, now, payload)
        ])

        // Clean up old entries (beyond window)
        const cutoff = now - (this.config.window * 1000)
        await Promise.all([
            redis.zremrangebyscore(globalKey, 0, cutoff),
            redis.zremrangebyscore(facetKey, 0, cutoff)
        ])

        // Set TTL
        await Promise.all([
            redis.expire(globalKey, this.config.window * 2),
            redis.expire(facetKey, this.config.window * 2)
        ])

        // Update latency metric (only if provided and > 0)
        if (latency !== undefined && latency > 0) {
            await this.updateLatency(providerId, latency)
            provider_health_latency_avg.set({ provider: providerId }, latency)
        }

        // Check circuit breaker
        if (!success) {
            await this.handleFailure(providerId, errorType)
        } else {
            await this.handleSuccess(providerId)
        }

        // --- Phase 25: Invalidate Cache ---
        healthCache.delete(`${providerId}:${countryKey}`)
    }

    /**
     * Get current health status
     */
    async getHealth(providerId: string, country?: string | number): Promise<ProviderHealth> {
        const countryKey = country ? String(country) : 'GLOBAL'
        const cacheKey = `${providerId}:${countryKey}`

        // --- Phase 25: Memory Cache Check ---
        const cached = healthCache.get(cacheKey)
        if (cached && cached.expires > Date.now()) {
            return cached.data
        }

        const [
            circuitState,
            successRate,
            avgLatency,
            consecutiveFailures,
            lastError,
        ] = await Promise.all([
            this.getCircuitState(providerId),
            this.getSuccessRate(providerId, countryKey),
            this.getAvgLatency(providerId),
            this.getConsecutiveFailures(providerId),
            this.getLastError(providerId),
        ])

        // Determine overall status
        let status: 'healthy' | 'degraded' | 'down' = 'healthy'
        let statusValue = 0 // for prometheus
        if (circuitState === 'open') {
            status = 'down'
            statusValue = 2
        } else if (successRate < this.config.successRateThreshold) {
            status = 'degraded'
            statusValue = 1
        }

        // Update Prometheus
        provider_health_success_rate.set({ provider: providerId, country: countryKey }, successRate)
        provider_health_status.set({ provider: providerId }, statusValue)

        const health: ProviderHealth = {
            providerId,
            status,
            successRate,
            avgLatency,
            avgDeliveryTime: await this.getAvgDeliveryTime(providerId, country),
            avgSmsCount: await this.getAvgSmsCount(providerId, country),
            circuitState,
            lastError,
            lastCheckedAt: new Date(),
            consecutiveFailures,
        }

        // Update Cache
        healthCache.set(cacheKey, { data: health, expires: Date.now() + CACHE_TTL })

        return health
    }

    /**
     * Get all providers health
     */
    async getAllHealth(): Promise<ProviderHealth[]> {
        const providers = await prisma.provider.findMany({
            where: { isActive: true },
            select: { id: true },
        })

        return Promise.all(
            providers.map(p => this.getHealth(p.id))
        )
    }

    /**
     * Check if provider is available
     */
    async isAvailable(providerId: string): Promise<boolean> {
        const state = await this.getCircuitState(providerId)
        return state === 'closed' || state === 'half-open'
    }

    /**
     * Manually open circuit (disable provider)
     */
    async openCircuit(providerId: string): Promise<void> {
        await redis.set(
            `health:${providerId}:circuit`,
            'open',
            'EX', Math.floor(this.config.openDuration / 1000)
        )
        logger.warn('Circuit manually opened', { providerId })
    }

    /**
     * Manually close circuit (enable provider)
     */
    async closeCircuit(providerId: string): Promise<void> {
        await redis.del(`health:${providerId}:circuit`)
        await redis.del(`health:${providerId}:failures`)
        logger.info('Circuit manually closed', { providerId })
    }

    // ============================================
    // PRIVATE METHODS
    // ============================================

    private async handleFailure(providerId: string, errorType?: string): Promise<void> {
        // Increment consecutive failures
        const failures = await redis.incr(`health:${providerId}:failures`)
        const retryCount = await redis.incr(`health:${providerId}:retryCount`)

        // Store error
        await redis.set(
            `health:${providerId}:lastError`,
            `${new Date().toISOString()} - ${errorType || 'UNKNOWN'}`,
            'EX',
            3600 // 1 hour
        )

        // --- Phase 25: Predictive Trip ---
        // Systemic errors trip the circuit immediately
        const isSystemic = errorType === 'SYSTEMIC'

        // Check if should open circuit
        if (isSystemic || failures >= this.config.failureThreshold) {
            // --- Phase 25: Exponential Recovery Backoff ---
            // Increase open duration based on how many times we've tripped recently
            const backoffMultiplier = Math.min(10, Math.pow(2, Math.max(0, retryCount - 1)))
            const openDuration = this.config.openDuration * backoffMultiplier

            await redis.set(
                `health:${providerId}:circuit`,
                'open',
                'EX', Math.floor(openDuration / 1000)
            )

            logger.error('Circuit breaker opened', {
                providerId,
                consecutiveFailures: failures,
                errorType,
                backoffMultiplier,
                openDurationMs: openDuration
            })

            // Log to database
            await this.logHealthEvent(providerId, 'down')
        }
    }

    private async handleSuccess(providerId: string): Promise<void> {
        const state = await this.getCircuitState(providerId)

        if (state === 'half-open') {
            // Check if enough successful requests in half-open
            const successCount = await redis.incr(
                `health:${providerId}:halfOpenSuccess`
            )

            if (successCount >= this.config.halfOpenRequests) {
                // Close circuit
                await redis.del(`health:${providerId}:circuit`)
                await redis.del(`health:${providerId}:halfOpenSuccess`)
                await redis.del(`health:${providerId}:failures`)
                await redis.del(`health:${providerId}:retryCount`) // Reset backoff

                logger.info('Circuit breaker closed', { providerId })
                await this.logHealthEvent(providerId, 'healthy')
            }
        } else {
            // Reset consecutive failures but keep retryCount for recent history
            await redis.del(`health:${providerId}:failures`)
            // Gradually decay retry count on success
            const currentRetry = await redis.get(`health:${providerId}:retryCount`)
            if (currentRetry && parseInt(currentRetry) > 0) {
                await redis.decr(`health:${providerId}:retryCount`)
            }
        }
    }

    private async getCircuitState(
        providerId: string
    ): Promise<'open' | 'closed' | 'half-open'> {
        const state = await redis.get(`health:${providerId}:circuit`)

        if (!state) return 'closed'
        if (state === 'open') {
            // Check if should transition to half-open
            const ttl = await redis.ttl(`health:${providerId}:circuit`)
            if (ttl <= 0) {
                await redis.set(`health:${providerId}:circuit`, 'half-open')
                await redis.del(`health:${providerId}:halfOpenSuccess`)
                return 'half-open'
            }
            return 'open'
        }
        return state as 'half-open'
    }

    /**
     * Get Success Rate with Exponential Time Decay
     * Recent requests are weighted significantly higher than older ones.
     */
    private async getSuccessRate(providerId: string, countryKey: string = 'GLOBAL'): Promise<number> {
        const key = countryKey === 'GLOBAL'
            ? `health:${providerId}:requests`
            : `health:${providerId}:${countryKey}:requests`

        const requests = await redis.zrange(key, 0, -1)

        if (requests.length === 0) {
            // If facet has no data, fallback to GLOBAL
            if (countryKey !== 'GLOBAL') return this.getSuccessRate(providerId, 'GLOBAL')
            return 1.0
        }

        const now = Date.now()
        const windowMs = this.config.window * 1000

        let weightedSuccess = 0
        let totalWeight = 0

        for (const r of requests) {
            try {
                const data = JSON.parse(r as string)
                const age = now - data.timestamp

                // Weight formula: weight = 1 / (1 + age_factor)
                // Newer requests (age close to 0) get weight ~1
                // Older requests (age close to window) get lower weight
                const weight = Math.pow(0.5, age / (windowMs / 4)) // Halve weight every 1/4 of the window

                if (data.success) weightedSuccess += weight
                totalWeight += weight
            } catch {
                continue
            }
        }

        return totalWeight > 0 ? (weightedSuccess / totalWeight) : 1.0
    }

    private async getAvgLatency(providerId: string): Promise<number> {
        const latencies = await redis.lrange(
            `health:${providerId}:latency`,
            0,
            99
        )

        if (latencies.length === 0) return 0

        const sum = latencies.reduce((acc, l) => acc + parseFloat(l as string), 0)
        return Math.round(sum / latencies.length)
    }

    private async updateLatency(
        providerId: string,
        latency: number
    ): Promise<void> {
        const key = `health:${providerId}:latency`
        await redis.lpush(key, String(latency))
        await redis.ltrim(key, 0, 99) // Keep last 100
        await redis.expire(key, 3600) // 1 hour
    }

    async getAvgDeliveryTime(providerId: string, country?: string | number): Promise<number> {
        const countryKey = country ? String(country) : 'GLOBAL'
        const key = countryKey === 'GLOBAL'
            ? `health:${providerId}:deliveryTime`
            : `health:${providerId}:${countryKey}:deliveryTime`

        const times = await redis.lrange(key, 0, -1)
        if (times.length === 0) {
            if (countryKey !== 'GLOBAL') return this.getAvgDeliveryTime(providerId, 'GLOBAL')
            return 0
        }

        const sum = times.reduce((acc, t) => acc + parseFloat(t), 0)
        return Math.round(sum / times.length)
    }

    /**
     * Record SMS Count for a completed activation (Multi-SMS tracking)
     */
    async recordSmsCount(providerId: string, count: number, country?: string | number): Promise<void> {
        const countryKey = country ? String(country) : 'GLOBAL'
        const globalKey = `health:${providerId}:smsCount`
        const facetKey = `health:${providerId}:${countryKey}:smsCount`

        await Promise.all([
            redis.lpush(globalKey, String(count)),
            redis.lpush(facetKey, String(count))
        ])

        await Promise.all([
            redis.ltrim(globalKey, 0, 99),
            redis.ltrim(facetKey, 0, 99)
        ])

        await Promise.all([
            redis.expire(globalKey, 86400 * 3),
            redis.expire(facetKey, 86400 * 3)
        ])
    }

    /**
     * Get Average SMS Count per activation
     */
    async getAvgSmsCount(providerId: string, country?: string | number): Promise<number> {
        const countryKey = country ? String(country) : 'GLOBAL'
        const key = countryKey === 'GLOBAL'
            ? `health:${providerId}:smsCount`
            : `health:${providerId}:${countryKey}:smsCount`

        const counts = await redis.lrange(key, 0, -1)
        if (counts.length === 0) {
            if (countryKey !== 'GLOBAL') return this.getAvgSmsCount(providerId, 'GLOBAL')
            return 1.0
        }

        const sum = counts.reduce((acc, c) => acc + parseFloat(c), 0)
        return Number((sum / counts.length).toFixed(2))
    }

    /**
     * Record SMS Delivery Time (Order -> SMS received)
     */
    async recordDeliveryTime(providerId: string, durationMs: number, country?: string | number): Promise<void> {
        if (!durationMs || durationMs < 0) return
        const countryKey = country ? String(country) : 'GLOBAL'
        const globalKey = `health:${providerId}:deliveryTime`
        const facetKey = `health:${providerId}:${countryKey}:deliveryTime`

        await Promise.all([
            redis.lpush(globalKey, String(durationMs)),
            redis.lpush(facetKey, String(durationMs))
        ])

        await Promise.all([
            redis.ltrim(globalKey, 0, 49),
            redis.ltrim(facetKey, 0, 49)
        ])

        await Promise.all([
            redis.expire(globalKey, 86400 * 3),
            redis.expire(facetKey, 86400 * 3)
        ])
    }



    private async getConsecutiveFailures(providerId: string): Promise<number> {
        const failures = await redis.get(`health:${providerId}:failures`)
        return failures ? parseInt(failures as string, 10) : 0
    }

    private async getLastError(providerId: string): Promise<string | undefined> {
        const error = await redis.get(`health:${providerId}:lastError`)
        return error as string | undefined
    }

    private async logHealthEvent(
        providerId: string,
        status: 'healthy' | 'degraded' | 'down'
    ): Promise<void> {
        const health = await this.getHealth(providerId)

        await prisma.providerHealthLog.create({
            data: {
                providerId,
                status,
                successRate: health.successRate,
                avgLatency: health.avgLatency,
                errorCount: health.consecutiveFailures,
                checkedAt: new Date(),
            },
        })
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const healthMonitor = new HealthMonitor()
