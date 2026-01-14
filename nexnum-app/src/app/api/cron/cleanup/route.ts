import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

/**
 * Database Cleanup Cron Job
 * 
 * Purpose: Keep Supabase free tier usage low by:
 * 1. Deleting old audit_logs (>30 days)
 * 2. Archiving/deleting old completed orders (>90 days)
 * 3. Cleaning up stale wallet reservations
 * 
 * Schedule: Run daily via external cron (e.g., Vercel Cron, AWS EventBridge)
 * Endpoint: POST /api/cron/cleanup
 * 
 * Security: Protected by CRON_SECRET env variable
 */

const RETENTION_DAYS = {
    AUDIT_LOGS: 30,
    ORDERS: 90,
    RESERVATIONS: 1, // Stale reservations older than 1 day
}

export async function POST(req: NextRequest) {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = {
        auditLogs: 0,
        orders: 0,
        reservations: 0,
        errors: [] as string[],
    }

    try {
        // 1. Clean old audit logs (>30 days)
        const auditCutoff = new Date()
        auditCutoff.setDate(auditCutoff.getDate() - RETENTION_DAYS.AUDIT_LOGS)

        const deletedAuditLogs = await prisma.auditLog.deleteMany({
            where: {
                createdAt: { lt: auditCutoff }
            }
        })
        results.auditLogs = deletedAuditLogs.count
        logger.info(`[Cleanup] Deleted ${deletedAuditLogs.count} old audit logs`)
    } catch (e: any) {
        logger.error('[Cleanup] Failed to clean audit logs', { error: e.message })
        results.errors.push(`audit_logs: ${e.message}`)
    }

    try {
        // 2. Delete completed/cancelled orders older than 90 days
        // Keep failed orders for investigation
        const ordersCutoff = new Date()
        ordersCutoff.setDate(ordersCutoff.getDate() - RETENTION_DAYS.ORDERS)

        const deletedOrders = await prisma.number.deleteMany({
            where: {
                createdAt: { lt: ordersCutoff },
                status: { in: ['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] }
            }
        })
        results.orders = deletedOrders.count
        logger.info(`[Cleanup] Deleted ${deletedOrders.count} old orders`)
    } catch (e: any) {
        logger.error('[Cleanup] Failed to clean old orders', { error: e.message })
        results.errors.push(`orders: ${e.message}`)
    }

    try {
        // 3. Clean stale wallet reservations (stuck > 1 day)
        const reservationCutoff = new Date()
        reservationCutoff.setDate(reservationCutoff.getDate() - RETENTION_DAYS.RESERVATIONS)

        // Find wallets with non-zero reserved that have no active numbers
        const staleReservations = await prisma.$executeRaw`
            UPDATE wallets w
            SET reserved = 0, updated_at = NOW()
            WHERE reserved > 0
            AND NOT EXISTS (
                SELECT 1 FROM numbers n 
                WHERE n.owner_id = w.user_id 
                AND n.status IN ('PENDING', 'ACTIVE', 'WAITING')
                AND n.created_at > ${reservationCutoff}
            )
        `
        results.reservations = staleReservations as number
        logger.info(`[Cleanup] Released ${staleReservations} stale reservations`)
    } catch (e: any) {
        logger.error('[Cleanup] Failed to clean reservations', { error: e.message })
        results.errors.push(`reservations: ${e.message}`)
    }

    // Log summary
    logger.info('[Cleanup] Daily cleanup completed', results)

    return NextResponse.json({
        success: results.errors.length === 0,
        cleaned: {
            auditLogs: results.auditLogs,
            orders: results.orders,
            reservations: results.reservations,
        },
        errors: results.errors.length > 0 ? results.errors : undefined,
        timestamp: new Date().toISOString(),
    })
}

// Also support GET for easy testing
export async function GET(req: NextRequest) {
    return POST(req)
}
