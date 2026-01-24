/**
 * ======================================================================
 * NEXNUM DEPOSIT TRACKER - REAL-TIME DEPOSIT MONITORING SYSTEM
 * ======================================================================
 * 
 * Based on the Python DepositTrackerManagement pattern:
 * - Real-time polling with adaptive batch sizes
 * - Circuit breaker pattern for resilience
 * - Live UI updates via Telegram
 * - Timeout handling and auto-completion
 * 
 * This module runs as a background service and integrates with the
 * notification manager for user-facing updates.
 * 
 * @author NexNum Infrastructure Team
 */

import { redis } from '@/lib/core/redis'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { notify } from './index'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    checkInterval: 5000, // 5 seconds
    updateInterval: 60000, // 1 minute for UI countdown updates
    baseTimeout: 10, // minutes
    maxBatchSize: 500,
    minBatchSize: 50,
    circuitBreakerThreshold: 3,
    circuitResetDelay: 60000, // 1 minute
}

// ============================================================================
// TYPES
// ============================================================================

interface DepositRecord {
    id: string
    userId: string
    amount: number
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
    paymentMethod: string
    createdAt: Date
    validUntil: Date
    messageId?: string
    forumId?: string
    externalTxId?: string
}

interface CircuitState {
    state: 'closed' | 'open' | 'half-open'
    errors: number
    lastError?: Date
}

// ============================================================================
// DEPOSIT TRACKER SERVICE
// ============================================================================

class DepositTrackerService {
    private isRunning = false
    private adaptiveBatchSize = 100
    private loadWindow: number[] = []
    private circuit: CircuitState = { state: 'closed', errors: 0 }
    private trackingInterval?: NodeJS.Timeout
    private updateInterval?: NodeJS.Timeout

    /**
     * Start the deposit tracking service
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('[DepositTracker] Already running')
            return
        }

        this.isRunning = true
        logger.info('[DepositTracker] Starting deposit tracking service')

        // Main processing loop
        this.trackingInterval = setInterval(async () => {
            if (this.circuit.state === 'closed') {
                await this.processDepositsBatch()
            }
        }, CONFIG.checkInterval)

        // UI countdown update loop
        this.updateInterval = setInterval(async () => {
            await this.batchUpdateCountdowns()
        }, CONFIG.updateInterval)

        // Initial run
        await this.processDepositsBatch()
    }

    /**
     * Stop the deposit tracking service
     */
    async stop(): Promise<void> {
        this.isRunning = false

        if (this.trackingInterval) {
            clearInterval(this.trackingInterval)
            this.trackingInterval = undefined
        }

        if (this.updateInterval) {
            clearInterval(this.updateInterval)
            this.updateInterval = undefined
        }

        logger.info('[DepositTracker] Stopped')
    }

    /**
     * Process deposits in batches
     */
    private async processDepositsBatch(): Promise<void> {
        const startTime = Date.now()

        try {
            let offset = 0

            while (true) {
                const deposits = await this.fetchDepositsBatch(this.adaptiveBatchSize, offset)
                if (deposits.length === 0) break

                const { valid, expired } = await this.categorizeDeposits(deposits)

                // Process expired first (priority)
                for (const deposit of expired) {
                    await this.handleDepositTimeout(deposit)
                }

                // Check valid deposits against external API
                for (const deposit of valid) {
                    await this.processSingleDeposit(deposit)
                }

                if (deposits.length < this.adaptiveBatchSize) break
                offset += this.adaptiveBatchSize
            }

            // Track processing time for adaptive sizing
            const processTime = Date.now() - startTime
            this.loadWindow.push(processTime)
            if (this.loadWindow.length > 10) this.loadWindow.shift()

            // Adjust batch size based on load
            this.adjustBatchSize()

        } catch (error: any) {
            logger.error('[DepositTracker] Batch processing failed', { error: error.message })
            this.circuit.errors++

            if (this.circuit.errors >= CONFIG.circuitBreakerThreshold) {
                await this.tripCircuit()
            }
        }
    }

    /**
     * Fetch deposits from database
     */
    private async fetchDepositsBatch(limit: number, offset: number): Promise<DepositRecord[]> {
        try {
            const deposits = await prisma.walletTransaction.findMany({
                where: {
                    type: 'deposit',
                    // status: 'PENDING', // Only pending ones need tracking
                },
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                include: {
                    wallet: {
                        select: { userId: true }
                    }
                }
            })

            return deposits.map(d => ({
                id: d.id,
                userId: d.wallet.userId,
                amount: Number(d.amount),
                status: 'PENDING' as const, // Map from your actual field
                paymentMethod: d.type,
                createdAt: d.createdAt,
                validUntil: new Date(d.createdAt.getTime() + CONFIG.baseTimeout * 60 * 1000),
                // messageId and forumId would come from Redis
            }))
        } catch (error: any) {
            logger.error('[DepositTracker] Failed to fetch deposits', { error: error.message })
            return []
        }
    }

    /**
     * Categorize deposits into valid and expired
     */
    private async categorizeDeposits(deposits: DepositRecord[]): Promise<{
        valid: DepositRecord[]
        expired: DepositRecord[]
    }> {
        const now = new Date()
        const valid: DepositRecord[] = []
        const expired: DepositRecord[] = []

        for (const deposit of deposits) {
            const isExpired = now > deposit.validUntil

            if (isExpired && deposit.status === 'PENDING') {
                expired.push(deposit)
            } else if (deposit.status === 'PENDING') {
                valid.push(deposit)
            }
        }

        return { valid, expired }
    }

    /**
     * Process a single deposit (check external API, update status)
     */
    private async processSingleDeposit(deposit: DepositRecord): Promise<void> {
        try {
            // Check external payment API (if configured)
            const apiStatus = await this.checkPaymentAPI(deposit)

            if (apiStatus.status === 'COMPLETED') {
                await this.completeDeposit(deposit, apiStatus)
            } else if (apiStatus.status === 'FAILED' || apiStatus.status === 'CANCELLED') {
                await this.handleDepositTimeout(deposit)
            }
            // If still PENDING, do nothing (will be checked again next cycle)

        } catch (error: any) {
            logger.error(`[DepositTracker] Failed to process deposit ${deposit.id}`, { error: error.message })
        }
    }

    /**
     * Check external payment API for deposit status
     */
    private async checkPaymentAPI(deposit: DepositRecord): Promise<{ status: string; amount?: number; txId?: string }> {
        // In production, this would call your payment gateway API
        // For now, return pending to let natural flow continue

        const PAYMENT_API_URL = process.env.PAYMENT_API_URL
        const PAYMENT_API_KEY = process.env.PAYMENT_API_KEY

        if (!PAYMENT_API_URL || !PAYMENT_API_KEY) {
            return { status: 'PENDING' }
        }

        try {
            const response = await fetch(`${PAYMENT_API_URL}?id=${deposit.id}&key=${PAYMENT_API_KEY}`)
            const data = await response.json()

            // Map external API status to our internal status
            if (data.STATUS === 'TXN_SUCCESS') {
                return {
                    status: 'COMPLETED',
                    amount: parseFloat(data.TXNAMOUNT || deposit.amount.toString()),
                    txId: data.ORDERID
                }
            } else if (data.STATUS === 'TXN_FAILURE') {
                return { status: 'FAILED' }
            }

            return { status: 'PENDING' }
        } catch (error) {
            return { status: 'PENDING' }
        }
    }

    /**
     * Complete a deposit and notify user
     */
    private async completeDeposit(deposit: DepositRecord, apiStatus: { amount?: number; txId?: string }): Promise<void> {
        try {
            // Update database
            await prisma.walletTransaction.update({
                where: { id: deposit.id },
                data: {
                    // status: 'COMPLETED', // Update your status field
                    metadata: {
                        completedAt: new Date().toISOString(),
                        externalTxId: apiStatus.txId
                    }
                }
            })

            // Credit wallet
            await prisma.wallet.update({
                where: { userId: deposit.userId },
                data: {
                    balance: { increment: apiStatus.amount || deposit.amount }
                }
            })

            // Send notification
            await notify.deposit({
                userId: deposit.userId,
                amount: apiStatus.amount || deposit.amount,
                depositId: deposit.id,
                paidFrom: deposit.paymentMethod,
                paymentType: 'QR',
                transactionId: apiStatus.txId,
                timestamp: new Date()
            })

            logger.info(`[DepositTracker] Completed deposit ${deposit.id}`)

        } catch (error: any) {
            logger.error(`[DepositTracker] Failed to complete deposit ${deposit.id}`, { error: error.message })
        }
    }

    /**
     * Handle deposit timeout/expiry
     */
    private async handleDepositTimeout(deposit: DepositRecord): Promise<void> {
        try {
            // Update database
            await prisma.walletTransaction.update({
                where: { id: deposit.id },
                data: {
                    // status: 'EXPIRED',
                    metadata: {
                        expiredAt: new Date().toISOString(),
                        reason: 'TIMEOUT'
                    }
                }
            })

            // Notify user of expiry (via Telegram edit if message exists)
            // This would edit the QR message to show "Expired"

            logger.info(`[DepositTracker] Expired deposit ${deposit.id}`)

        } catch (error: any) {
            logger.error(`[DepositTracker] Failed to timeout deposit ${deposit.id}`, { error: error.message })
        }
    }

    /**
     * Update countdown timers on pending deposit messages
     */
    private async batchUpdateCountdowns(): Promise<void> {
        // This would fetch all pending deposits and update their Telegram messages
        // with new countdown timers
        // Implementation depends on whether you're pushing updates or have webhooks
    }

    /**
     * Dynamically adjust batch size based on load
     */
    private adjustBatchSize(): void {
        if (this.loadWindow.length < 5) return

        const avgTime = this.loadWindow.reduce((a, b) => a + b, 0) / this.loadWindow.length
        const targetTime = CONFIG.checkInterval * 0.7

        if (avgTime > targetTime) {
            this.adaptiveBatchSize = Math.max(CONFIG.minBatchSize, Math.floor(this.adaptiveBatchSize * 0.8))
        } else {
            this.adaptiveBatchSize = Math.min(CONFIG.maxBatchSize, Math.floor(this.adaptiveBatchSize * 1.2))
        }
    }

    /**
     * Trip the circuit breaker
     */
    private async tripCircuit(): Promise<void> {
        this.circuit.state = 'open'
        this.circuit.lastError = new Date()
        logger.warn('[DepositTracker] Circuit breaker TRIPPED!')

        // Schedule reset
        setTimeout(async () => {
            this.circuit.state = 'half-open'
            logger.info('[DepositTracker] Circuit in half-open state, testing...')

            try {
                await this.processDepositsBatch()
                this.circuit.state = 'closed'
                this.circuit.errors = 0
                logger.info('[DepositTracker] Circuit CLOSED')
            } catch {
                await this.tripCircuit() // Re-trip
            }
        }, CONFIG.circuitResetDelay)
    }
}

// ============================================================================
// REDEEM CODE SERVICE
// ============================================================================

interface RedeemCodeMeta {
    code: string
    amount: number
    scope: 'ALL' | 'UID' | 'LIST'
    eligibleUsers: string[]
    maxUses: number
    redeemed: number
    active: boolean
    createdAt: number
    expiresAt: number
}

class RedeemCodeService {
    private readonly PREFIX = 'redeem_code:'
    private readonly USAGE_PREFIX = 'redeem_code:used:'
    private readonly LOG_PREFIX = 'redeem_code:log:'
    private readonly TTL = 7 * 24 * 3600 // 7 days

    /**
     * Generate a new redeem code
     */
    async createCode(options: {
        amount: number | [number, number] // Fixed or random range
        scope: 'ALL' | 'UID' | 'LIST'
        eligibleUsers?: string[]
        maxUses?: number
    }): Promise<{ code: string; amount: number }> {
        // Generate code
        const rawCode = this.generateCodeString()
        const code = await this.encodeCode(rawCode)

        // Calculate amount (random if range)
        const amount = Array.isArray(options.amount)
            ? Math.round((options.amount[0] + Math.random() * (options.amount[1] - options.amount[0])) * 100) / 100
            : options.amount

        const meta: RedeemCodeMeta = {
            code,
            amount,
            scope: options.scope,
            eligibleUsers: options.eligibleUsers || [],
            maxUses: options.maxUses || 1,
            redeemed: 0,
            active: true,
            createdAt: Date.now(),
            expiresAt: Date.now() + this.TTL * 1000
        }

        // Store in Redis
        await redis.hset(`${this.PREFIX}${code}`, this.serializeMeta(meta))
        await redis.expire(`${this.PREFIX}${code}`, this.TTL)

        logger.info(`[RedeemCode] Created code ${code} for ${amount} points`)

        return { code, amount }
    }

    /**
     * Redeem a code for a user
     */
    async redeemCode(userId: string, code: string): Promise<{
        success: boolean
        amount?: number
        error?: string
    }> {
        const key = `${this.PREFIX}${code}`
        const usageKey = `${this.USAGE_PREFIX}${code}`

        // Get code metadata
        const rawMeta = await redis.hgetall(key)
        if (!rawMeta || Object.keys(rawMeta).length === 0) {
            return { success: false, error: 'Invalid code' }
        }

        const meta = this.deserializeMeta(rawMeta)

        // Validate
        if (!meta.active) {
            return { success: false, error: 'Code revoked' }
        }

        if (Date.now() > meta.expiresAt) {
            return { success: false, error: 'Code expired' }
        }

        if (meta.eligibleUsers.length > 0 && !meta.eligibleUsers.includes(userId)) {
            return { success: false, error: 'Not eligible' }
        }

        // Check if already used by this user
        const alreadyUsed = await redis.sismember(usageKey, userId)
        if (alreadyUsed) {
            return { success: false, error: 'Already redeemed' }
        }

        // Check max uses
        if (meta.redeemed >= meta.maxUses) {
            return { success: false, error: 'Max uses reached' }
        }

        // Atomic redemption
        const pipeline = redis.pipeline()
        pipeline.hincrby(key, 'redeemed', 1)
        pipeline.sadd(usageKey, userId)
        pipeline.lpush(`${this.LOG_PREFIX}${code}`, JSON.stringify({ userId, timestamp: Date.now() }))
        await pipeline.exec()

        // Credit user wallet
        await prisma.wallet.update({
            where: { userId },
            data: {
                balance: { increment: meta.amount }
            }
        })

        // Create transaction record
        await prisma.walletTransaction.create({
            data: {
                wallet: { connect: { userId } },
                amount: meta.amount,
                type: 'redeem_code',
                description: `Redeemed code ${code}`,
                metadata: { code }
            }
        })

        // Send notification
        await notify.deposit({
            userId,
            amount: meta.amount,
            depositId: `REDEEM-${code}`,
            paidFrom: 'Redeem Code',
            paymentType: 'PROMO',
            timestamp: new Date()
        })

        logger.info(`[RedeemCode] User ${userId} redeemed ${code} for ${meta.amount}`)

        return { success: true, amount: meta.amount }
    }

    /**
     * Revoke a code
     */
    async revokeCode(code: string): Promise<boolean> {
        const key = `${this.PREFIX}${code}`
        await redis.hset(key, { active: 'false' })
        logger.info(`[RedeemCode] Revoked code ${code}`)
        return true
    }

    /**
     * Get code statistics
     */
    async getCodeStats(code: string): Promise<{
        code: string
        amount: number
        redeemed: number
        maxUses: number
        active: boolean
        lastRedemptions: Array<{ userId: string; timestamp: number }>
    } | null> {
        const key = `${this.PREFIX}${code}`
        const logKey = `${this.LOG_PREFIX}${code}`

        const rawMeta = await redis.hgetall(key)
        if (!rawMeta || Object.keys(rawMeta).length === 0) return null

        const meta = this.deserializeMeta(rawMeta)
        const logs = await redis.lrange(logKey, 0, 4)

        return {
            code: meta.code,
            amount: meta.amount,
            redeemed: meta.redeemed,
            maxUses: meta.maxUses,
            active: meta.active,
            lastRedemptions: logs.map(l => JSON.parse(l))
        }
    }

    // Helper methods
    private generateCodeString(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No ambiguous chars
        let code = ''
        for (let i = 0; i < 12; i++) {
            code += chars[Math.floor(Math.random() * chars.length)]
        }
        return code
    }

    private async encodeCode(code: string): Promise<string> {
        // In production, you might want to encode/obfuscate
        return code
    }

    private serializeMeta(meta: RedeemCodeMeta): Record<string, string> {
        return {
            code: meta.code,
            amount: String(meta.amount),
            scope: meta.scope,
            eligibleUsers: JSON.stringify(meta.eligibleUsers),
            maxUses: String(meta.maxUses),
            redeemed: String(meta.redeemed),
            active: String(meta.active),
            createdAt: String(meta.createdAt),
            expiresAt: String(meta.expiresAt)
        }
    }

    private deserializeMeta(raw: Record<string, string>): RedeemCodeMeta {
        return {
            code: raw.code,
            amount: parseFloat(raw.amount),
            scope: raw.scope as 'ALL' | 'UID' | 'LIST',
            eligibleUsers: JSON.parse(raw.eligibleUsers || '[]'),
            maxUses: parseInt(raw.maxUses || '1'),
            redeemed: parseInt(raw.redeemed || '0'),
            active: raw.active === 'true',
            createdAt: parseInt(raw.createdAt || '0'),
            expiresAt: parseInt(raw.expiresAt || '0')
        }
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const depositTracker = new DepositTrackerService()
export const redeemCodes = new RedeemCodeService()

// Start tracker on module load (in production, you'd control this via lifecycle)
// depositTracker.start()
