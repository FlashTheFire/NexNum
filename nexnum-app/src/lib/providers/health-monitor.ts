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
        latency: number
    ): Promise<void> {
        const now = Date.now()

        // Store in Redis sorted set (score = timestamp)
        const key = `health:${providerId}:requests`
        await redis.zadd(key, {
            score: now,
            member: JSON.stringify({
                success,
                latency,
                timestamp: now,
            })
        })

        // Clean up old entries (beyond window)
        const cutoff = now - (this.config.window * 1000)
        await redis.zremrangebyscore(key, 0, cutoff)

        // Set TTL
        await redis.expire(key, this.config.window * 2)

        // Update latency metric
        await this.updateLatency(providerId, latency)

        // Check circuit breaker
        if (!success) {
            await this.handleFailure(providerId)
        } else {
            await this.handleSuccess(providerId)
        }
    }

    /**
     * Get current health status
     */
    async getHealth(providerId: string): Promise<ProviderHealth> {
        const [
            circuitState,
            successRate,
            avgLatency,
            consecutiveFailures,
            lastError,
        ] = await Promise.all([
            this.getCircuitState(providerId),
            this.getSuccessRate(providerId),
            this.getAvgLatency(providerId),
            this.getConsecutiveFailures(providerId),
            this.getLastError(providerId),
        ])

        // Determine overall status
        let status: 'healthy' | 'degraded' | 'down' = 'healthy'
        if (circuitState === 'open') {
            status = 'down'
        } else if (successRate < this.config.successRateThreshold) {
            status = 'degraded'
        }

        return {
            providerId,
            status,
            successRate,
            avgLatency,
            circuitState,
            lastError,
            lastCheckedAt: new Date(),
            consecutiveFailures,
        }
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
            { ex: Math.floor(this.config.openDuration / 1000) }
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

    private async handleFailure(providerId: string): Promise<void> {
        // Increment consecutive failures
        const failures = await redis.incr(` health:${providerId}:failures`)

        // Store error
        await redis.setex(
            `health:${providerId}:lastError`,
            3600, // 1 hour
            new Date().toISOString()
        )

        // Check if should open circuit
        if (failures >= this.config.failureThreshold) {
            await redis.set(
                `health:${providerId}:circuit`,
                'open',
                { ex: Math.floor(this.config.openDuration / 1000) }
            )

            logger.error('Circuit breaker opened', {
                providerId,
                consecutiveFailures: failures,
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

                logger.info('Circuit breaker closed', { providerId })
                await this.logHealthEvent(providerId, 'healthy')
            }
        } else {
            // Reset consecutive failures
            await redis.del(`health:${providerId}:failures`)
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

    private async getSuccessRate(providerId: string): Promise<number> {
        const key = `health:${providerId}:requests`
        const requests = await redis.zrange(key, 0, -1)

        if (requests.length === 0) return 1.0

        const successful = requests.filter(r => {
            try {
                const data = JSON.parse(r as string)
                return data.success
            } catch {
                return false
            }
        }).length

        return successful / requests.length
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
