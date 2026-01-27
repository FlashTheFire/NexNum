/**
 * Order Orchestrator
 * 
 * Central hub for all SMS order management operations.
 * Connects all components into a cohesive, professional workflow.
 * 
 * Components:
 * - WalletService: Reserve → Commit/Rollback pattern
 * - ActivationService: Order creation with fund reservation
 * - NumberLifecycleManager: Polling, timeout, expiry handling
 * - AdaptivePollStrategy: Intelligent polling intervals
 * - BatchPollManager: Efficient provider API usage
 * - MultiSmsHandler: Automatic multi-SMS support
 * - State Machine: Validated state transitions
 * 
 * Flow:
 * 1. Purchase: Check balance → Reserve funds → Request number → Create order
 * 2. Poll: Adaptive polling → Check status → Handle SMS
 * 3. Complete: SMS received → Notify user → Commit funds
 * 4. Expire: Timeout → Cancel at provider → Refund user
 */

import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { WalletService } from '@/lib/wallet/wallet'
import { ActivationService } from './activation-service'
import { ActivationKernel } from './activation-kernel'
import { lifecycleManager } from './number-lifecycle-manager'
import { MultiSmsHandler } from '@/lib/sms/multi-sms-handler'
import { BatchPollManager, getActiveNumbersForPolling } from './batch-poll-manager'
import { getNextPollDelay, describePollStrategy } from './adaptive-poll-strategy'
import { canTransition, isRefundable, transition, STATE_METADATA } from './activation-state-machine'
import type { ActivationState } from '@prisma/client'
import {
    order_state_transitions_total,
    order_processing_duration_seconds,
    wallet_operation_duration_seconds,
    wallet_refunds_total,
    active_orders_gauge
} from '@/lib/metrics'

// ============================================================================
// Types
// ============================================================================

export interface PurchaseRequest {
    userId: string
    providerId: string
    countryCode: string
    serviceCode: string
    price: number
    serviceName?: string
    countryName?: string
    operatorId?: string
    idempotencyKey?: string
}

export interface PurchaseResult {
    success: boolean
    orderId?: string
    activationId?: string
    phoneNumber?: string
    error?: string
    errorCode?: 'INSUFFICIENT_BALANCE' | 'PROVIDER_ERROR' | 'INVALID_REQUEST' | 'SYSTEM_ERROR'
}

export interface OrderStatus {
    orderId: string
    state: ActivationState
    stateLabel: string
    stateColor: string
    phoneNumber?: string
    smsCount: number
    messages: Array<{ code?: string; content: string; receivedAt: Date }>
    createdAt: Date
    expiresAt?: Date
    canCancel: boolean
    canRequestResend: boolean
}

// ============================================================================
// Order Orchestrator
// ============================================================================

export class OrderOrchestrator {

    /**
     * Purchase a new phone number
     * 
     * Complete flow:
     * 1. Check available balance
     * 2. Reserve funds (atomic)
     * 3. Request number from provider
     * 4. On success: Create order, schedule polling
     * 5. On failure: Rollback reservation, return error
     */
    static async purchase(request: PurchaseRequest): Promise<PurchaseResult> {
        const startTime = Date.now()
        const { userId, providerId, countryCode, serviceCode, price, serviceName, countryName, operatorId, idempotencyKey } = request

        logger.info('[OrderOrchestrator] Starting purchase', {
            userId,
            providerId,
            countryCode,
            serviceCode,
            price
        })

        try {
            // 1. Check balance
            const balance = await WalletService.getBalance(userId)
            if (balance < price) {
                logger.warn('[OrderOrchestrator] Insufficient balance', { userId, balance, price })
                return {
                    success: false,
                    error: 'Insufficient balance',
                    errorCode: 'INSUFFICIENT_BALANCE'
                }
            }

            // 2. Create activation with reservation (atomic operation)
            const walletTimer = order_processing_duration_seconds.labels(providerId, 'reserve').startTimer

            const activation = await ActivationService.createWithReservation({
                userId,
                price,
                serviceName: serviceName || serviceCode,
                countryCode,
                countryName,
                operatorId,
                providerId,
                idempotencyKey
            })

            walletTimer() // Stop timer for wallet operation

            // 3. Record state transition (INIT → RESERVED)
            order_state_transitions_total.labels('INIT', 'RESERVED', providerId).inc()

            // 4. Request number from provider
            const { getProviderAdapter } = await import('@/lib/providers/provider-factory')
            const provider = await prisma.provider.findUnique({ where: { id: providerId } })

            if (!provider) {
                // Rollback reservation
                await WalletService.rollback(userId, price, activation.activationId, 'Provider not found')
                await ActivationKernel.transition(activation.activationId, 'FAILED', { reason: 'Provider not found' })
                order_state_transitions_total.labels('RESERVED', 'FAILED', providerId).inc()

                return {
                    success: false,
                    error: 'Provider not found',
                    errorCode: 'INVALID_REQUEST'
                }
            }

            const adapter = getProviderAdapter(provider)

            let numberResult
            try {
                numberResult = await adapter.getNumber(countryCode, serviceCode, {
                    maxPrice: price,
                    operator: operatorId
                })
            } catch (providerError: any) {
                // Provider failed - standard fallback
                logger.error('[OrderOrchestrator] Provider failed before acquisition', {
                    providerId,
                    error: providerError.message
                })

                await WalletService.rollback(userId, price, activation.activationId, `Provider error: ${providerError.message}`)
                await ActivationKernel.transition(activation.activationId, 'FAILED', { reason: providerError.message })
                order_state_transitions_total.labels('RESERVED', 'FAILED', providerId).inc()
                wallet_refunds_total.labels('provider_error').inc()

                return {
                    success: false,
                    error: providerError.message || 'Provider request failed',
                    errorCode: 'PROVIDER_ERROR'
                }
            }

            // --- SAGA START: Atomically commit to DB or queue Compensation ---
            try {
                const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 min default

                await prisma.$transaction(async (tx) => {
                    // 1. Confirm Activation via Kernel (Forensic log)
                    await ActivationKernel.transition(activation.activationId, 'ACTIVE', {
                        reason: 'Saga: Number acquired and confirmed',
                        tx
                    })

                    // 2. Commit the reserved funds
                    await WalletService.commit(
                        userId,
                        price,
                        activation.activationId,
                        `Purchase: ${serviceName || serviceCode} (${countryCode})`,
                        undefined,
                        tx as any
                    )

                    // 3. Finalize Activation record details
                    await tx.activation.update({
                        where: { id: activation.activationId },
                        data: {
                            providerActivationId: numberResult.id,
                            phoneNumber: numberResult.phone,
                            expiresAt
                        }
                    })
                })
                order_state_transitions_total.labels('RESERVED', 'ACTIVE', providerId).inc() // Metric for successful transition
            } catch (sagaError: any) {
                // DB FAILED AFTER NUMBER BOUGHT! 
                // CRITICAL: Must queue compensation task (Cancel at provider)
                logger.error('[OrderOrchestrator] SAGA CRITICAL FAILURE: Number bought but DB commit failed. Queueing compensation.', {
                    activationId: activation.activationId,
                    providerActivationId: numberResult.id,
                    error: sagaError.message
                })

                await ActivationKernel.dispatchEvent(
                    activation.activationId,
                    'saga.compensate.cancel_number',
                    { providerActivationId: numberResult.id, providerId },
                    prisma
                )

                // Still attempt to mark as failed in a new tx
                await ActivationKernel.transition(activation.activationId, 'FAILED', {
                    reason: `Saga Failure: ${sagaError.message}`
                }).catch(() => { })
                order_state_transitions_total.labels('RESERVED', 'FAILED', providerId).inc() // Metric for failed transition

                return {
                    success: false,
                    error: 'System synchronization failed. Number will be auto-cancelled.',
                    errorCode: 'SYSTEM_ERROR'
                }
            }
            // --- SAGA END ---

            // 6. Schedule polling
            await lifecycleManager.schedulePolling(
                activation.activationId,
                numberResult.id,
                userId
            )

            // 7. Update active orders gauge
            active_orders_gauge.labels(provider.name, 'active').inc()

            const duration = (Date.now() - startTime) / 1000
            order_processing_duration_seconds.labels(providerId, 'purchase').observe(duration)

            logger.info('[OrderOrchestrator] Purchase complete', {
                orderId: activation.activationId,
                phoneNumber: numberResult.phone,
                duration
            })

            return {
                success: true,
                orderId: activation.activationId,
                activationId: numberResult.id,
                phoneNumber: numberResult.phone
            }

        } catch (error: any) {
            logger.error('[OrderOrchestrator] Purchase failed', {
                userId,
                error: error.message,
                stack: error.stack
            })

            return {
                success: false,
                error: 'System error during purchase',
                errorCode: 'SYSTEM_ERROR'
            }
        }
    }

    /**
     * Get detailed order status
     */
    static async getOrderStatus(orderId: string, userId: string): Promise<OrderStatus | null> {
        const order = await prisma.activation.findFirst({
            where: {
                id: orderId,
                userId
            }
        })

        if (!order) return null

        // Get linked number if exists
        let number = null
        let smsMessages: any[] = []
        if (order.numberId) {
            number = await prisma.number.findUnique({
                where: { id: order.numberId },
                include: { smsMessages: { orderBy: { receivedAt: 'asc' } } }
            })
            smsMessages = number?.smsMessages || []
        }

        const stateMeta = STATE_METADATA[order.state as keyof typeof STATE_METADATA] || {
            label: order.state,
            color: 'gray',
            description: ''
        }

        const canCancel = order.state === 'ACTIVE' || order.state === 'RESERVED'
        const canRequestResend = order.state === 'ACTIVE' && smsMessages.length > 0

        return {
            orderId: order.id,
            state: order.state,
            stateLabel: stateMeta.label,
            stateColor: stateMeta.color,
            phoneNumber: order.phoneNumber || number?.phoneNumber,
            smsCount: smsMessages.length,
            messages: smsMessages.map(m => ({
                code: m.code || undefined,
                content: m.content || '',
                receivedAt: m.receivedAt
            })),
            createdAt: order.createdAt,
            expiresAt: order.expiresAt || number?.expiresAt || undefined,
            canCancel,
            canRequestResend
        }
    }

    /**
     * Cancel an active order
     */
    static async cancelOrder(orderId: string, userId: string): Promise<{ success: boolean; error?: string }> {
        const order = await prisma.activation.findFirst({
            where: { id: orderId, userId }
        })

        if (!order) {
            return { success: false, error: 'Order not found' }
        }

        if (!canTransition(order.state as any, 'CANCELLED')) {
            return { success: false, error: `Cannot cancel order in ${order.state} state` }
        }

        // Get linked number if exists
        const number = order.numberId
            ? await prisma.number.findUnique({ where: { id: order.numberId } })
            : null

        try {
            // 1. Cancel at provider
            if (number?.activationId) {
                const { getProviderAdapter } = await import('@/lib/providers/provider-factory')
                const provider = await prisma.provider.findFirst({
                    where: { name: number.provider || '' }
                })

                if (provider) {
                    const adapter = getProviderAdapter(provider)
                    try {
                        await adapter.cancelNumber(number.activationId)
                    } catch (e) {
                        logger.warn('[OrderOrchestrator] Provider cancel failed, continuing', { orderId, error: e })
                    }
                }
            }

            // 2. Update state
            await prisma.activation.update({
                where: { id: orderId },
                data: { state: 'CANCELLED' }
            })

            if (number) {
                await prisma.number.update({
                    where: { id: number.id },
                    data: { status: 'cancelled' }
                })
            }

            // 3. Process refund
            await ActivationService.processRefund(orderId)

            order_state_transitions_total.labels(order.state, 'CANCELLED', number?.provider || 'unknown').inc()
            wallet_refunds_total.labels('user_cancelled').inc()

            logger.info('[OrderOrchestrator] Order cancelled', { orderId, userId })

            return { success: true }

        } catch (error: any) {
            logger.error('[OrderOrchestrator] Cancel failed', { orderId, error: error.message })
            return { success: false, error: 'Failed to cancel order' }
        }
    }

    /**
     * Request resend SMS (for multi-SMS services)
     */
    static async requestResendSms(orderId: string, userId: string): Promise<{ success: boolean; error?: string }> {
        const order = await prisma.activation.findFirst({
            where: { id: orderId, userId }
        })

        if (!order) {
            return { success: false, error: 'Order not found' }
        }

        if (order.state !== 'ACTIVE') {
            return { success: false, error: 'Order is not active' }
        }

        // Get linked number
        const number = order.numberId
            ? await prisma.number.findUnique({
                where: { id: order.numberId },
                include: { smsMessages: true }
            })
            : null

        if (!number) {
            return { success: false, error: 'Number not found' }
        }

        if ((number.smsMessages?.length || 0) === 0) {
            return { success: false, error: 'No SMS received yet, please wait' }
        }

        // Get provider ID
        const provider = await prisma.provider.findFirst({
            where: { name: number.provider || '' }
        })

        if (!provider) {
            return { success: false, error: 'Provider not found' }
        }

        const success = await MultiSmsHandler.requestNextSms(
            number.id,
            number.activationId || '',
            provider.id
        )

        if (success) {
            // Extend timeout
            await lifecycleManager.extendTimeout(
                number.id,
                number.activationId || '',
                userId
            )
        }

        return { success, error: success ? undefined : 'Provider does not support SMS resend' }
    }

    /**
     * Run batch polling for all active orders
     * Called by the lifecycle manager or a scheduled job
     */
    static async runBatchPoll(): Promise<{ polled: number; smsReceived: number }> {
        const items = await getActiveNumbersForPolling()

        if (items.length === 0) {
            return { polled: 0, smsReceived: 0 }
        }

        const results = await BatchPollManager.pollBatch(items)

        let smsReceived = 0
        for (const result of results) {
            if (result.messages && result.messages.length > 0) {
                smsReceived++
            }
        }

        return { polled: items.length, smsReceived }
    }

    /**
     * Get system health status
     */
    static async getHealthStatus(): Promise<{
        lifecycleManager: { initialized: boolean; error?: string }
        activeOrders: number
        queueStats: any
        pollStrategy: string
    }> {
        const activeOrders = await prisma.number.count({
            where: { status: 'active' }
        })

        const queueStats = await lifecycleManager.getStats()

        return {
            lifecycleManager: {
                initialized: !lifecycleManager.lastError,
                error: lifecycleManager.lastError || undefined
            },
            activeOrders,
            queueStats,
            pollStrategy: describePollStrategy()
        }
    }
}

// ============================================================================
// Re-exports for Clean Imports
// ============================================================================

export { WalletService } from '@/lib/wallet/wallet'
export { ActivationService } from './activation-service'
export { lifecycleManager } from './number-lifecycle-manager'
export { MultiSmsHandler } from '@/lib/sms/multi-sms-handler'
export { BatchPollManager, getActiveNumbersForPolling } from './batch-poll-manager'
export { AdaptivePollStrategy, getNextPollDelay, describePollStrategy } from './adaptive-poll-strategy'
export * from './activation-state-machine'
