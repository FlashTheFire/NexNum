
import { processActivationOutbox } from '@/lib/activation/activation-outbox-worker'
import { processOutboxEvents } from '@/lib/activation/outbox' // Legacy outbox
import { processPushBatch } from '@/workers/push-worker'
import { processInboxBatch } from '@/workers/inbox-worker'
import { processReconciliationBatch } from '@/workers/reconcile-worker'
import { cleanupNow } from '@/lib/activation/reservation-cleanup'
import { logger } from '@/lib/core/logger'

interface MasterWorkerResult {
    timestamp: string
    duration: number
    outbox: any
    legacyOutbox: any
    notifications: any
    inbox: any
    reconcile: any
    reservations: any
    errors: string[]
}

/**
 * Master Worker
 * Orchestrates all background processes in a single run.
 * Execution order is prioritized by criticality.
 */
export async function runMasterWorker(): Promise<MasterWorkerResult> {
    const start = Date.now()
    const errors: string[] = []
    const results: Partial<MasterWorkerResult> = {}

    try {
        // PRIORITY 1: CORE TELEPHONY OPERATIONS
        try {
            results.outbox = await processActivationOutbox(20)
        } catch (e: any) {
            logger.error('Outbox Critical Failure', { error: e.message })
            errors.push(`Outbox: ${e.message}`)
        }

        try {
            results.legacyOutbox = await processOutboxEvents(20)
        } catch (e: any) {
            logger.error('Search Sync Failure', { error: e.message })
            errors.push(`LegacyOutbox: ${e.message}`)
        }

        try {
            results.inbox = await processInboxBatch(50)
        } catch (e: any) {
            logger.error('Inbox Polling Failure', { error: e.message })
            errors.push(`Inbox: ${e.message}`)
        }

        // PRIORITY 2: USER ENGAGEMENT
        try {
            results.notifications = await processPushBatch(50)
        } catch (e: any) {
            logger.error('Push Delivery Failure', { error: e.message })
            errors.push(`Push: ${e.message}`)
        }

        // PRIORITY 3: SYSTEM MAINTENANCE
        try {
            results.reservations = await cleanupNow()
        } catch (e: any) {
            logger.error('Maintenance Failure', { error: e.message })
            errors.push(`Cleanup: ${e.message}`)
        }

        try {
            results.reconcile = await processReconciliationBatch()
        } catch (e: any) {
            logger.error('Reconciliation Failure', { error: e.message })
            errors.push(`Reconcile: ${e.message}`)
        }

        // PRIORITY 4: ASSET INTEGRITY
        // REMOVED from worker loop - now runs ONLY during provider sync (worker-entry.ts)
        // This eliminates the frequent "[ASSETS] Scanning..." logs

    } catch (criticalError: any) {
        logger.error('Worker Loop Critical Failure', { error: criticalError.message })
        errors.push(`Critical: ${criticalError.message}`)
    }

    const duration = Date.now() - start

    return {
        timestamp: new Date().toISOString(),
        duration: duration,
        outbox: results.outbox || null,
        legacyOutbox: results.legacyOutbox || null,
        notifications: results.notifications || null,
        inbox: results.inbox || null,
        reconcile: results.reconcile || null,
        reservations: results.reservations || null,
        errors
    }
}
