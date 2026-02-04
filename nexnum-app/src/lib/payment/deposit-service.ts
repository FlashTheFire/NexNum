/**
 * Deposit Service
 * 
 * Orchestrates the complete deposit lifecycle:
 * - Create deposit order
 * - Track status
 * - Confirm/expire deposits
 * - Credit wallet on success
 * 
 * @module payment/deposit-service
 */

import { prisma } from '@/lib/core/db'
import { getUPIProvider, PaymentStatus } from './upi-provider'
import { getPaymentSettingsService } from './payment-settings'
import { getCurrencyService } from './currency-service'
import { PaymentError } from './payment-errors'
import { logger } from '@/lib/core/logger'
import { redis } from '@/lib/core/redis'
import { nanoid } from 'nanoid'

// ============================================================================
// Types
// ============================================================================

export type DepositStatus = 'pending' | 'completed' | 'failed' | 'expired'

export interface Deposit {
    id: string
    userId: string
    walletId: string
    orderId: string
    amount: number
    status: DepositStatus
    paymentUrl: string
    qrCodeUrl: string
    expiresAt: Date
    expiresIn: number
    utr?: string
    completedAt?: Date
    createdAt: Date
}

export interface CreateDepositInput {
    userId: string
    amount: number
    customerMobile?: string
    redirectUrl?: string
}

interface DepositMetadata {
    orderId: string
    paymentUrl: string
    qrCodeUrl: string
    expiresAt: string
    status: DepositStatus
    utr?: string
    completedAt?: string
    failureReason?: string
    expiredAt?: string
    failedAt?: string
    [key: string]: string | undefined // Index signature for Prisma JSON compatibility
}

// Redis keys for deposit tracking
const DEPOSIT_KEY = (id: string) => `deposit:${id}`
const USER_PENDING_DEPOSITS = (userId: string) => `deposits:pending:${userId}`
const DEPOSIT_EXPIRY_SECONDS = 35 * 60 // 35 minutes (buffer over 30 min timeout)

// ============================================================================
// Deposit Service
// ============================================================================

export class DepositService {
    private provider = getUPIProvider()

    /**
     * Get or create wallet for user
     */
    private async ensureWallet(userId: string): Promise<string> {
        const wallet = await prisma.wallet.upsert({
            where: { userId },
            create: { userId, balance: 0, reserved: 0 },
            update: {},
            select: { id: true },
        })
        return wallet.id
    }

    /**
     * Create a new deposit order
     */
    async createDeposit(input: CreateDepositInput): Promise<Deposit> {
        const { userId, amount, customerMobile = '9999999999', redirectUrl } = input

        // Get config for max pending deposits
        const config = await getPaymentSettingsService().getConfig()

        // Check for existing pending deposits
        const pendingCount = await this.getPendingDepositCount(userId)
        if (pendingCount >= config.maxPendingDeposits) {
            throw PaymentError.declined(`Maximum ${config.maxPendingDeposits} pending deposits allowed. Please complete or wait for existing deposits to expire.`)
        }

        // Ensure wallet exists
        const walletId = await this.ensureWallet(userId)

        // Generate unique deposit ID and order ID
        const depositId = `dep_${nanoid(16)}`
        const orderId = this.provider.generateOrderId(userId)

        // Determine redirect URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const finalRedirectUrl = redirectUrl || `${baseUrl}/dashboard/wallet?deposit=${depositId}`

        try {
            // Create order with payment provider
            const order = await this.provider.createOrder(orderId, amount, customerMobile, finalRedirectUrl)

            // Calculate expiry
            const expiresAt = order.expiresAt

            // Deposit metadata
            const metadata: DepositMetadata = {
                orderId: order.orderId,
                paymentUrl: order.paymentUrl,
                qrCodeUrl: order.qrCodeUrl,
                expiresAt: expiresAt.toISOString(),
                status: 'pending',
            }

            // Create deposit record (dual storage: DB + Redis for fast access)
            const deposit: Deposit = {
                id: depositId,
                userId,
                walletId,
                orderId: order.orderId,
                amount,
                status: 'pending',
                paymentUrl: order.paymentUrl,
                qrCodeUrl: order.qrCodeUrl,
                expiresAt,
                expiresIn: order.expiresIn,
                createdAt: new Date(),
            }

            // Store in Redis for fast polling
            await redis.setex(DEPOSIT_KEY(depositId), DEPOSIT_EXPIRY_SECONDS, JSON.stringify(deposit))

            // Track user's pending deposits
            await redis.sadd(USER_PENDING_DEPOSITS(userId), depositId)
            await redis.expire(USER_PENDING_DEPOSITS(userId), DEPOSIT_EXPIRY_SECONDS)

            // Create wallet transaction record with status in metadata
            await prisma.walletTransaction.create({
                data: {
                    id: depositId,
                    walletId,
                    type: 'deposit',
                    amount,
                    description: `UPI Deposit - Order: ${order.orderId}`,
                    metadata,
                },
            })

            logger.info('[DepositService] Deposit created', {
                depositId,
                orderId: order.orderId,
                userId,
                amount,
                expiresAt: expiresAt.toISOString(),
            })

            return deposit
        } catch (error: any) {
            logger.error('[DepositService] Create deposit failed', { error: error.message, userId, amount })
            if (error instanceof PaymentError) throw error
            throw PaymentError.providerError('Failed to create deposit')
        }
    }

    /**
     * Get deposit by ID
     */
    async getDeposit(depositId: string): Promise<Deposit | null> {
        // Try Redis first (fast)
        const cached = await redis.get(DEPOSIT_KEY(depositId))
        if (cached) {
            const deposit = JSON.parse(cached)
            // Ensure dates are Date objects
            deposit.expiresAt = new Date(deposit.expiresAt)
            deposit.createdAt = new Date(deposit.createdAt)
            if (deposit.completedAt) deposit.completedAt = new Date(deposit.completedAt)
            return deposit
        }

        // Fallback to database
        const tx = await prisma.walletTransaction.findUnique({
            where: { id: depositId },
            include: { wallet: { select: { userId: true } } },
        })

        if (!tx || tx.type !== 'deposit') return null

        const metadata = (tx.metadata as unknown as DepositMetadata) || {} as DepositMetadata

        return {
            id: tx.id,
            userId: tx.wallet.userId,
            walletId: tx.walletId,
            orderId: metadata.orderId || '',
            amount: Number(tx.amount),
            status: metadata.status || 'pending',
            paymentUrl: metadata.paymentUrl || '',
            qrCodeUrl: metadata.qrCodeUrl || '',
            expiresAt: new Date(metadata.expiresAt),
            expiresIn: 0, // Expired deposits don't have remaining time
            utr: metadata.utr,
            completedAt: metadata.completedAt ? new Date(metadata.completedAt) : undefined,
            createdAt: tx.createdAt,
        }
    }

    /**
     * Check and update deposit status
     */
    async checkStatus(depositId: string): Promise<PaymentStatus & { deposit: Deposit | null }> {
        const deposit = await this.getDeposit(depositId)

        if (!deposit) {
            return { status: 'failed', message: 'Deposit not found', deposit: null }
        }

        // Already completed or failed
        if (deposit.status === 'completed') {
            return { status: 'completed', amount: deposit.amount, utr: deposit.utr, deposit }
        }
        if (deposit.status === 'failed' || deposit.status === 'expired') {
            return { status: deposit.status, message: 'Deposit is no longer active', deposit }
        }

        // Check if expired
        if (new Date() > deposit.expiresAt) {
            await this.expireDeposit(depositId)
            return { status: 'expired', message: 'Deposit has expired', deposit: { ...deposit, status: 'expired' } }
        }

        // Check with payment provider
        const status = await this.provider.checkStatus(deposit.orderId)

        if (status.status === 'completed') {
            await this.confirmDeposit(depositId, status.amount || deposit.amount, status.utr)
            return {
                ...status,
                deposit: { ...deposit, status: 'completed', utr: status.utr, completedAt: new Date() }
            }
        }

        if (status.status === 'failed') {
            await this.failDeposit(depositId, status.message)
            return { ...status, deposit: { ...deposit, status: 'failed' } }
        }

        // Calculate remaining time
        const remainingMs = deposit.expiresAt.getTime() - Date.now()
        const updatedDeposit = { ...deposit, expiresIn: Math.max(0, Math.floor(remainingMs / 1000)) }

        return { status: 'pending', message: status.message, deposit: updatedDeposit }
    }

    /**
     * Confirm successful deposit and credit wallet (with optional bonus)
     * 
     * FINANCIAL INTEGRITY: Converts INR → Points using CurrencyService
     * Amount parameter is in INR (from UPI payment)
     */
    async confirmDeposit(depositId: string, amount: number, utr?: string): Promise<void> {
        const deposit = await this.getDeposit(depositId)
        if (!deposit || deposit.status !== 'pending') {
            logger.warn('[DepositService] Cannot confirm non-pending deposit', { depositId })
            return
        }

        // Get config for bonus calculation
        const config = await getPaymentSettingsService().getConfig()
        const currencyService = getCurrencyService()

        // CRITICAL FIX: Convert INR to Points (was directly crediting INR as Points = 100x inflation)
        const basePointsFromInr = await currencyService.inrToPoints(amount)

        // Calculate bonus on Points (not on INR)
        const bonusPercent = Number(config.depositBonusPercent) || 0
        const bonusPoints = bonusPercent > 0 ? Math.floor((basePointsFromInr * bonusPercent) / 100) : 0
        const totalPointsCredit = basePointsFromInr + bonusPoints

        // Pre-compute fiat equivalents for audit trail
        const fiatEquivalents = await currencyService.pointsToAllFiat(totalPointsCredit)

        try {
            await prisma.$transaction(async (tx) => {
                // Get current transaction to access metadata
                const currentTx = await tx.walletTransaction.findUnique({
                    where: { id: depositId },
                    select: { metadata: true },
                })

                const currentMetadata = (currentTx?.metadata as unknown as DepositMetadata) || {} as DepositMetadata

                // Update transaction record with forensic metadata
                await tx.walletTransaction.update({
                    where: { id: depositId },
                    data: {
                        amount: totalPointsCredit, // Store as Points (internal currency)
                        metadata: {
                            ...currentMetadata,
                            status: 'completed',
                            utr,
                            completedAt: new Date().toISOString(),
                            // Forensic Audit Fields
                            depositFiatAmount: amount.toString(),
                            depositFiatCurrency: 'INR',
                            basePointsConverted: basePointsFromInr.toString(),
                            bonusPercent: bonusPercent.toString(),
                            bonusPoints: bonusPoints.toString(),
                            totalPointsCredited: totalPointsCredit.toString(),
                            fiatEquivalentUSD: fiatEquivalents.USD.toString(),
                            fiatEquivalentINR: fiatEquivalents.INR.toString(),
                        },
                    },
                })

                // Credit wallet with Points (not raw INR)
                await tx.wallet.update({
                    where: { id: deposit.walletId },
                    data: { balance: { increment: totalPointsCredit } },
                })

                // Audit log for deposit confirmation with full financial trail
                await tx.auditLog.create({
                    data: {
                        userId: deposit.userId,
                        action: 'DEPOSIT_CONFIRMED',
                        resourceType: 'WALLET',
                        resourceId: depositId,
                        metadata: {
                            orderId: deposit.orderId,
                            depositFiatAmount: amount,
                            depositFiatCurrency: 'INR',
                            basePointsConverted: basePointsFromInr,
                            bonusPercent,
                            bonusPoints,
                            totalPointsCredited: totalPointsCredit,
                            fiatEquivalents: { ...fiatEquivalents },
                            utr: utr || null,
                        },
                        ipAddress: null,
                    },
                })
            })

            // Update Redis cache
            const updatedDeposit = { ...deposit, status: 'completed' as const, utr, completedAt: new Date() }
            await redis.setex(DEPOSIT_KEY(depositId), 3600, JSON.stringify(updatedDeposit))

            // Remove from pending list
            await redis.srem(USER_PENDING_DEPOSITS(deposit.userId), depositId)

            logger.info('[DepositService] Deposit confirmed with forensic integrity', {
                depositId,
                depositFiatAmount: amount,
                depositFiatCurrency: 'INR',
                basePointsConverted: basePointsFromInr,
                bonusPoints,
                totalPointsCredited: totalPointsCredit,
                fiatEquivalentUSD: fiatEquivalents.USD,
                utr,
                userId: deposit.userId
            })
        } catch (error: any) {
            logger.error('[DepositService] Confirm deposit failed', { error: error.message, depositId })
            throw error
        }
    }

    /**
     * Mark deposit as failed
     */
    async failDeposit(depositId: string, reason?: string): Promise<void> {
        const deposit = await this.getDeposit(depositId)
        if (!deposit || deposit.status !== 'pending') return

        // Get current metadata
        const currentTx = await prisma.walletTransaction.findUnique({
            where: { id: depositId },
            select: { metadata: true },
        })

        const currentMetadata = (currentTx?.metadata as unknown as DepositMetadata) || {} as DepositMetadata

        await prisma.walletTransaction.update({
            where: { id: depositId },
            data: {
                metadata: {
                    ...currentMetadata,
                    status: 'failed',
                    failureReason: reason,
                    failedAt: new Date().toISOString(),
                },
            },
        })

        // Update Redis
        await redis.setex(DEPOSIT_KEY(depositId), 3600, JSON.stringify({ ...deposit, status: 'failed' }))
        await redis.srem(USER_PENDING_DEPOSITS(deposit.userId), depositId)

        logger.info('[DepositService] Deposit failed', { depositId, reason })
    }

    /**
     * Expire a deposit
     */
    async expireDeposit(depositId: string): Promise<void> {
        const deposit = await this.getDeposit(depositId)
        if (!deposit || deposit.status !== 'pending') return

        // Get current metadata
        const currentTx = await prisma.walletTransaction.findUnique({
            where: { id: depositId },
            select: { metadata: true },
        })

        const currentMetadata = (currentTx?.metadata as unknown as DepositMetadata) || {} as DepositMetadata

        await prisma.walletTransaction.update({
            where: { id: depositId },
            data: {
                metadata: {
                    ...currentMetadata,
                    status: 'expired',
                    expiredAt: new Date().toISOString(),
                },
            },
        })

        // Update Redis
        await redis.setex(DEPOSIT_KEY(depositId), 3600, JSON.stringify({ ...deposit, status: 'expired' }))
        await redis.srem(USER_PENDING_DEPOSITS(deposit.userId), depositId)

        logger.info('[DepositService] Deposit expired', { depositId })
    }

    /**
     * Get user's pending deposits
     */
    async getPendingDeposits(userId: string): Promise<Deposit[]> {
        const depositIds = await redis.smembers(USER_PENDING_DEPOSITS(userId))
        const deposits: Deposit[] = []

        for (const id of depositIds) {
            const deposit = await this.getDeposit(id)
            if (deposit && deposit.status === 'pending') {
                // Check if actually expired
                if (new Date() > deposit.expiresAt) {
                    await this.expireDeposit(id)
                } else {
                    deposits.push(deposit)
                }
            }
        }

        return deposits
    }

    /**
     * Get count of user's pending deposits
     */
    async getPendingDepositCount(userId: string): Promise<number> {
        return await redis.scard(USER_PENDING_DEPOSITS(userId))
    }

    /**
     * Get provider public config
     */
    getConfig() {
        return this.provider.getPublicConfig()
    }
}

// Singleton instance
let serviceInstance: DepositService | null = null

export function getDepositService(): DepositService {
    if (!serviceInstance) {
        serviceInstance = new DepositService()
    }
    return serviceInstance
}
