
import { processActivationOutbox } from '@/lib/activation/activation-outbox-worker'
import { processOutboxEvents } from '@/lib/activation/outbox' // Search Index Sync
import { processPushBatch } from '@/workers/push-worker'
import { processInboxBatch } from '@/workers/inbox-worker'
// import { processReconciliationBatch } from '@/workers/reconcile-worker'
// import { cleanupNow } from '@/lib/activation/reservation-cleanup'
import { logger } from '@/lib/core/logger'

interface MasterWorkerResult {
    timestamp: string
    duration: number
    outbox: any
    searchSync: any
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
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error('Outbox Critical Failure', { context: 'MASTER', error: msg })
            errors.push(`Outbox: ${msg}`)
        }

        try {
            results.searchSync = await processOutboxEvents(20)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error('Search Sync Failure', { context: 'MASTER', error: msg })
            errors.push(`SearchSync: ${msg}`)
        }

        try {
            results.inbox = await processInboxBatch(50)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error('Inbox Polling Failure', { context: 'MASTER', error: msg })
            errors.push(`Inbox: ${msg}`)
        }

        // PRIORITY 2: USER ENGAGEMENT
        try {
            results.notifications = await processPushBatch(50)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error('Push Delivery Failure', { context: 'MASTER', error: msg })
            errors.push(`Push: ${msg}`)
        }

        // PRIORITY 3 operations (Cleanup, Reconcile) moved to Cron Workers
        // See: worker-entry.ts


        // PRIORITY 4: ASSET INTEGRITY
        // REMOVED from worker loop - now runs ONLY during provider sync (worker-entry.ts)
        // This eliminates the frequent "[ASSETS] Scanning..." logs

    } catch (criticalError: unknown) {
        const msg = criticalError instanceof Error ? criticalError.message : String(criticalError)
        logger.error('Worker Loop Critical Failure', { context: 'MASTER', error: msg })
        errors.push(`Critical: ${msg}`)
    }

    const duration = Date.now() - start

    return {
        timestamp: new Date().toISOString(),
        duration: duration,
        outbox: results.outbox || null,
        searchSync: results.searchSync || null,
        notifications: results.notifications || null,
        inbox: results.inbox || null,
        reconcile: results.reconcile || null,
        reservations: results.reservations || null,
        errors
    }
}
