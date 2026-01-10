import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { WalletService } from '@/lib/wallet'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Reconciliation Worker
 * Phase 11 Enhanced:
 * 1. Scans for stuck/expired PENDING purchase orders and releases funds
 * 2. Scans for stuck RESERVED activations and marks them FAILED
 * 3. Processes refundable states (EXPIRED, FAILED, CANCELLED) -> REFUNDED
 * 
 * Should be called via Cron (e.g., every 1-5 minutes).
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const now = new Date()
        const stuckThreshold = new Date(now.getTime() - 5 * 60 * 1000) // 5 minutes ago

        const results = {
            purchaseOrders: { processed: 0, succeeded: 0, failed: 0 },
            activations: { processed: 0, succeeded: 0, failed: 0 },
            refunds: { processed: 0, succeeded: 0, failed: 0 }
        }

        // 1. Handle stuck PurchaseOrders (Legacy)
        const expiredOrders = await prisma.purchaseOrder.findMany({
            where: {
                status: 'PENDING',
                expiresAt: { lt: now }
            },
            take: 100
        })

        for (const order of expiredOrders) {
            results.purchaseOrders.processed++
            try {
                await prisma.$transaction(async (tx) => {
                    await WalletService.rollback(
                        order.userId,
                        order.amount.toNumber(),
                        order.id,
                        'Reconciliation Expired',
                        tx
                    )
                    await tx.purchaseOrder.update({
                        where: { id: order.id },
                        data: { status: 'FAILED' }
                    })
                })
                results.purchaseOrders.succeeded++
            } catch (err) {
                logger.error(`[Reconcile] PurchaseOrder ${order.id} failed`, err)
                results.purchaseOrders.failed++
            }
        }

        // 2. Handle stuck Activations in RESERVED state
        const stuckActivations = await prisma.activation.findMany({
            where: {
                state: 'RESERVED',
                createdAt: { lt: stuckThreshold }
            },
            take: 100
        })

        for (const activation of stuckActivations) {
            results.activations.processed++
            try {
                await prisma.$transaction(async (tx) => {
                    // Rollback reservation
                    await WalletService.rollback(
                        activation.userId,
                        activation.price.toNumber(),
                        activation.id,
                        'Reconciliation: Stuck RESERVED',
                        tx
                    )
                    // Mark as FAILED
                    await tx.activation.update({
                        where: { id: activation.id },
                        data: { state: 'FAILED' }
                    })
                })
                results.activations.succeeded++
                logger.info(`[Reconcile] Activation ${activation.id} -> FAILED (stuck)`)
            } catch (err) {
                logger.error(`[Reconcile] Activation ${activation.id} failed`, err)
                results.activations.failed++
            }
        }

        // 3. Process pending refunds (EXPIRED, FAILED, CANCELLED without refund yet)
        const pendingRefunds = await prisma.activation.findMany({
            where: {
                state: { in: ['EXPIRED', 'FAILED', 'CANCELLED'] },
                refundTxId: null // No refund processed yet
            },
            take: 100
        })

        for (const activation of pendingRefunds) {
            results.refunds.processed++
            try {
                await prisma.$transaction(async (tx) => {
                    const refundTx = await WalletService.refund(
                        activation.userId,
                        activation.price.toNumber(),
                        'refund',
                        activation.id,
                        `Reconciliation Refund: ${activation.state}`,
                        `refund_${activation.id}`,
                        tx
                    )
                    await tx.activation.update({
                        where: { id: activation.id },
                        data: {
                            state: 'REFUNDED',
                            refundTxId: refundTx.id
                        }
                    })
                })
                results.refunds.succeeded++
                logger.info(`[Reconcile] Activation ${activation.id} -> REFUNDED`)
            } catch (err) {
                logger.error(`[Reconcile] Refund for ${activation.id} failed`, err)
                results.refunds.failed++
            }
        }

        return NextResponse.json({ success: true, results })
    } catch (err: any) {
        logger.error('[Reconcile] Critical error', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

