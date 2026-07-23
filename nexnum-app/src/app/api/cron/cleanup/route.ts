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
    PROVIDER_HEALTH_LOGS: 14, // Daily health checks → 14d covers ~2 weeks
    PROVIDER_TEST_RESULTS: 7, // Diagnostic test results → 7d
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
        providerHealthLogs: 0,
        providerTestResults: 0,
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
        // LIMIT prevents long-running locks on large tables
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
            LIMIT 1000
        `
        results.reservations = staleReservations as number
        logger.info(`[Cleanup] Released ${staleReservations} stale reservations`)
    } catch (e: any) {
        logger.error('[Cleanup] Failed to clean reservations', { error: e.message })
        results.errors.push(`reservations: ${e.message}`)
    }

    try {
        // 4. Prune provider health logs (keep last 14d). High-volume time-series
        // table; deleteMany is cheap because of the (providerId, checkedAt) index.
        const healthLogCutoff = new Date()
        healthLogCutoff.setDate(healthLogCutoff.getDate() - RETENTION_DAYS.PROVIDER_HEALTH_LOGS)
        const deletedHealthLogs = await prisma.providerHealthLog.deleteMany({
            where: { checkedAt: { lt: healthLogCutoff } }
        })
        results.providerHealthLogs = deletedHealthLogs.count
        logger.info(`[Cleanup] Deleted ${deletedHealthLogs.count} old provider health logs`)
    } catch (e: any) {
        logger.error('[Cleanup] Failed to clean provider health logs', { error: e.message })
        results.errors.push(`provider_health_logs: ${e.message}`)
    }

    try {
        // 5. Prune provider test results (keep last 7d). Diagnostic results
        // from /api/admin/providers/test sweep — debug-grade signal.
        const testResultCutoff = new Date()
        testResultCutoff.setDate(testResultCutoff.getDate() - RETENTION_DAYS.PROVIDER_TEST_RESULTS)
        const deletedTestResults = await prisma.providerTestResult.deleteMany({
            where: { testedAt: { lt: testResultCutoff } }
        })
        results.providerTestResults = deletedTestResults.count
        logger.info(`[Cleanup] Deleted ${deletedTestResults.count} old provider test results`)
    } catch (e: any) {
        logger.error('[Cleanup] Failed to clean provider test results', { error: e.message })
        results.errors.push(`provider_test_results: ${e.message}`)
    }

    // Log summary
    logger.info('[Cleanup] Daily cleanup completed', results)

    return NextResponse.json({
        success: results.errors.length === 0,
        cleaned: {
            auditLogs: results.auditLogs,
            orders: results.orders,
            reservations: results.reservations,
            providerHealthLogs: results.providerHealthLogs,
            providerTestResults: results.providerTestResults,
        },
        errors: results.errors.length > 0 ? results.errors : undefined,
        timestamp: new Date().toISOString(),
    })
}

// GET is not supported for destructive cleanup operations
export async function GET() {
    return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 })
}
