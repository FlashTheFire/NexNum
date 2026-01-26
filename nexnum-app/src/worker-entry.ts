// Adapting for Single-Process execution via instrumentation.ts

import { queue, QUEUES } from './lib/core/queue';
import { prisma } from './lib/core/db';
import { logger } from './lib/core/logger';
import { DynamicProvider } from './lib/providers/dynamic-provider';
import { DynamicWebhookHandler } from './lib/webhooks/handlers/dynamic';

export async function startQueueWorker() {
    logger.info('[Worker] Starting background queue & sync services...');

    try {
        // 1. Connect to Queue
        await queue.start();
        logger.info('[Worker] Queue service started successfully');

        // 2. Register Jobs

        // JOB: Webhook Processing
        await queue.work(QUEUES.WEBHOOK_PROCESSING, async (jobs: any[]) => {
            for (const job of jobs) {
                const { provider: providerName, payload } = job.data;
                logger.info(`[Worker] Processing webhook from ${providerName}`, { jobId: job.id });

                try {
                    // 1. Load provider configuration
                    const config = await prisma.provider.findFirst({
                        where: {
                            name: {
                                equals: providerName,
                                mode: 'insensitive'
                            }
                        }
                    });

                    if (!config) {
                        logger.error(`[Worker] Webhook received for unknown provider in worker`, {
                            provider: providerName,
                            jobId: job.id
                        });
                        continue; // Move to next job
                    }

                    // 2. Initialize Dynamic Engine
                    const provider = new DynamicProvider(config);
                    const handler = new DynamicWebhookHandler(provider);

                    // 3. Process (Idempotency is handled inside handler.process)
                    await handler.process(payload);

                    logger.info(`[Worker] Webhook processed successfully`, {
                        jobId: job.id,
                        provider: providerName,
                        activationId: payload.activationId
                    });
                } catch (error: any) {
                    logger.error(`[Worker] Webhook processing failed`, {
                        jobId: job.id,
                        error: error.message,
                        stack: error.stack
                    });
                    // Throwing here will cause pg-boss to retry based on queue policy
                    throw error;
                }
            }
        });

        // JOB: Provider Data Sync (Manual Trigger via API)
        await queue.work(QUEUES.PROVIDER_SYNC, async (jobs: any[]) => {
            for (const job of jobs) {
                const { provider } = job.data;
                logger.info(`[Worker] Starting sync job for ${provider || 'ALL'}`, { jobId: job.id });

                try {
                    // Dynamic import to avoid circular deps or load issues at startup
                    const { syncProviderData, syncAllProviders } = await import('./lib/providers/provider-sync');

                    let result;
                    if (provider) {
                        result = await syncProviderData(provider);
                    } else {
                        result = await syncAllProviders();
                    }

                    logger.info(`[Worker] Sync completed for ${provider || 'ALL'}`, { jobId: job.id, stats: result });
                } catch (error: any) {
                    logger.error(`[Worker] Sync failed for ${provider || 'ALL'}`, { jobId: job.id, error: error.message });
                    throw error;
                }
            }
        });

        // JOB: Master Worker Loop (Orchestrates ALL background tasks)
        // Uses runMasterWorker from master-worker.ts to handle Outbox, Inbox, Push, Cleanup, etc.
        const { runMasterWorker } = await import('./workers/master-worker');

        // Master Loop
        const runMasterLoop = async () => {
            try {
                const result = await runMasterWorker();

                // Helper to check if any work was done
                const hasWork = (
                    (result.outbox?.processed > 0) ||
                    (result.inbox?.processed > 0) ||
                    (result.notifications?.processed > 0) ||
                    (result.searchSync?.processed > 0)
                );

                if (hasWork) {
                    setTimeout(runMasterLoop, 2000); // 2s turbo mode
                } else {
                    setTimeout(runMasterLoop, 10000); // 10s idle
                }
            } catch (e) {
                logger.error('[Worker] Master loop crashed:', e);
                setTimeout(runMasterLoop, 30000);
            }
        };

        runMasterLoop();
        logger.info('[Worker] Master background loop started');

        // JOB: Smart Sync Scheduler (CRON: Every Midnight)
        // Uses pg-boss native scheduling for reliability
        const { syncAllProviders, verifyAssetIntegrity } = await import('./lib/providers/provider-sync');

        // 1. Register Worker for Scheduled Sync
        await queue.work(QUEUES.SCHEDULED_SYNC, async (jobs: any[]) => {
            logger.info(`[SmartSync] Starting Scheduled Sync (Job: ${jobs[0]?.id})`);
            try {
                // Pre-flight
                await verifyAssetIntegrity();

                // Main Sync
                const results = await syncAllProviders();
                const failed = results.filter(r => r.error).length;

                logger.info(`[SmartSync] Completed. Success: ${results.length - failed}, Failed: ${failed}`);
            } catch (e: any) {
                logger.error('[SmartSync] Failed execution:', e);
                throw e; // Retry later
            }
        });

        // JOB: Cleanup Service (CRON: Every 10 Minutes)
        const { cleanupNow } = await import('./lib/activation/reservation-cleanup');
        await queue.work(QUEUES.LIFECYCLE_CLEANUP, async () => {
            logger.info('[Cleanup] Starting routine maintenance...');
            const stats = await cleanupNow();
            if (stats.expiredReservations > 0 || stats.stockRestored > 0) {
                logger.info('[Cleanup] Maintenance Ops:', stats);
            }
        });
        await queue.schedule(QUEUES.LIFECYCLE_CLEANUP, '*/10 * * * *', {}); // Every 10 mins

        // JOB: Payment Reconciliation (CRON: Every 15 Minutes)
        const { processReconciliationBatch } = await import('./workers/reconcile-worker');
        await queue.work(QUEUES.PAYMENT_RECONCILE, async () => {
            logger.info('[Reconcile] Starting payment check...');
            const stats = await processReconciliationBatch();
            // Check if any significant work was done
            if (stats.refunds.processed > 0 || stats.activations.processed > 0) {
                logger.info('[Reconcile] Stats:', stats);
            }
        });
        await queue.schedule(QUEUES.PAYMENT_RECONCILE, '*/15 * * * *', {}); // Every 15 mins

        // 2. Schedule the Cron Job (Idempotent upsert)
        // Run at 00:00 every day
        await queue.schedule(QUEUES.SCHEDULED_SYNC, '0 0 * * *', {});
        logger.info('[Worker] Scheduled Jobs Initialized (Sync: 00:00, Cleanup: 10m, Reconcile: 15m)');

    } catch (e) {
        logger.error('[Worker] Fatal startup error:', e);
        // Do NOT exit process in Next.js instrumentation
    }
}

// EXECUTION CHECK
// If run directly via "npx tsx src/worker-entry.ts", start the worker.
// We detect this by checking if the process argument points to this file
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/worker-entry.ts')) {
    startQueueWorker().then(() => {
        logger.info('[Worker] Started successfully. Waiting for jobs...');

        // GRACEFUL SHUTDOWN HANDLERS
        const shutdown = async (signal: string) => {
            logger.info(`[Worker] Received ${signal}. Shutting down gracefully...`);

            try {
                // Stop accepting new jobs and wait for in-flight to complete
                await queue.stop();
                logger.info('[Worker] Queue stopped. Exiting.');
                process.exit(0);
            } catch (err) {
                logger.error('[Worker] Error during shutdown:', err);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    }).catch(err => {
        console.error('Worker failed to start:', err);
        process.exit(1);
    });
}
