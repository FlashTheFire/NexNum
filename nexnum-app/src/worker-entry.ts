import { queue, QUEUES } from './lib/core/queue';
import { prisma } from './lib/core/db';
import { logger } from './lib/core/logger';
import { orchestrator } from './lib/core/orchestrator';
import { registerWebhookWorker } from './workers/webhook-worker';

/**
 * Main Worker Entry Point
 * Handles registration and execution of all background jobs.
 */
export async function startQueueWorker() {
    logger.info('[Worker] Initializing background queue & sync services...');

    try {
        // 1. Connect to Queue
        await queue.start();

        // Register Global Shutdown Hook
        orchestrator.onShutdown(async () => {
            logger.info('[Worker] Stopping background queue...')
            await queue.stop()
        })

        // 2. Register Jobs

        // JOB: Enterprise Webhook Processing
        await registerWebhookWorker();

        // JOB: Provider Data Sync
        await queue.work(QUEUES.PROVIDER_SYNC, async (jobs: any[]) => {
            for (const job of jobs) {
                const { provider } = job.data;
                try {
                    const { syncProviderData, syncAllProviders } = await import('./lib/providers/provider-sync');
                    if (provider) await syncProviderData(provider); else await syncAllProviders();
                } catch (error: unknown) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    logger.error(`[Worker] Sync failed`, { jobId: job.id, error: errorMsg });
                    throw error;
                }
            }
        });

        // JOB: Master Worker Loop
        const { runMasterWorker } = await import('./workers/master-worker')
        await queue.work(QUEUES.MASTER_WORKER, async () => {
            const res = await runMasterWorker()
            if ((res.inbox?.processed || 0) > 0 || (res.outbox?.processed || 0) > 0 || (res.notifications?.processed || 0) > 0 || (res.reservations?.processed || 0) > 0 || res.errors.length > 0) {
                const timestamp = new Date().toLocaleTimeString('en-GB')
                logger.drawDashboard('NEXNUM MASTER WORKER', [
                    `[${timestamp}] ${res.errors.length > 0 ? '\x1b[31m🚫 ERROR' : '\x1b[32m✅ SUCCESS'}\x1b[0m   Master Worker Cycle Completed in \x1b[34m${res.duration}ms\x1b[0m`,
                    ``, `📦 INBOX: ${res.inbox?.processed || 0}`, `📤 OUTBOX: ${res.outbox?.processed || 0}`, `🔔 PUSH: ${res.notifications?.processed || 0}`, `🧹 CLEANUP: ${res.reservations?.processed || 0}`
                ])
            }
        });
        await queue.schedule(QUEUES.MASTER_WORKER, '* * * * *', {});

        // JOB: Smart Sync Scheduler (Daily)
        const { syncAllProviders, verifyAssetIntegrity } = await import('./lib/providers/provider-sync');
        await queue.work(QUEUES.SCHEDULED_SYNC, async () => {
            await verifyAssetIntegrity();
            await syncAllProviders();
        });
        await queue.schedule(QUEUES.SCHEDULED_SYNC, '0 0 * * *', {});

        // JOB: Cleanup Service (Every 10m)
        const { cleanupNow } = await import('./lib/activation/reservation-cleanup');
        await queue.work(QUEUES.LIFECYCLE_CLEANUP, async () => { await cleanupNow(); });
        await queue.schedule(QUEUES.LIFECYCLE_CLEANUP, '*/10 * * * *', {});

        // JOB: Payment Reconciliation (Every 15m)
        const { processReconciliationBatch } = await import('./workers/reconcile-worker');
        await queue.work(QUEUES.PAYMENT_RECONCILE, async () => { await processReconciliationBatch(); });
        await queue.schedule(QUEUES.PAYMENT_RECONCILE, '*/15 * * * *', {});

        // JOB: Search Aggregates Refresh (Every 5m)
        // Critical for "Search Services" API - keeps DB stats in sync with MeiliSearch
        const { refreshAllServiceAggregates } = await import('./lib/search/service-aggregates');
        await queue.work('search.aggregates', async () => { await refreshAllServiceAggregates(); });
        await queue.schedule('search.aggregates', '*/5 * * * *', {});

        // JOB: Provider Reliability Stats (Hourly)
        // Updates Success Rate based on recent order history
        const { calculateProviderReliability } = await import('./workers/reliability-worker');
        await queue.work('provider.reliability', async () => { await calculateProviderReliability(); });
        await queue.schedule('provider.reliability', '0 * * * *', {});

        // ───────────────────────────────────────────────────────────────────────
        // DEAD LETTER MANAGEMENT
        // ───────────────────────────────────────────────────────────────────────
        const boss = (queue as any).boss;
        if (boss) {
            boss.on('failed', async (job: any) => {
                await prisma.auditLog.create({
                    data: {
                        userId: 'SYSTEM',
                        action: 'job.failed_permanently',
                        resourceType: 'background_job',
                        resourceId: job.id,
                        metadata: { queue: job.name, data: job.data, error: job.output },
                        ipAddress: '127.0.0.1'
                    }
                });
            });
        }

        if (process.env.FORCE_SYNC === 'true') {
            const syncTarget = process.env.SYNC_PROVIDER;
            logger.info(`[Worker] FORCE_SYNC enabled${syncTarget ? ` for ${syncTarget}` : ''}: Triggering immediate sync...`);
            try {
                const { syncAllProviders } = await import('./lib/providers/provider-sync');
                await syncAllProviders();
                logger.info('[Worker] Force sync completed successfully.');
            } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                logger.error('[Worker] Force sync failed:', { error: errorMsg });
            }
        }
    } catch (e) {
        logger.error('[Worker] Fatal startup error:', { error: e });
    }
}

// STANDALONE EXECUTION
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/worker-entry.ts')) {
    orchestrator.bootstrap('Standalone:Worker').then(() => {
        return startQueueWorker();
    }).catch(err => {
        console.error('Worker failed to start:', err);
        process.exit(1);
    });
}
