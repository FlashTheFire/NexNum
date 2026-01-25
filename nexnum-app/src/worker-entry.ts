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
                    (result.legacyOutbox?.processed > 0)
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

        // JOB: Smart Sync Scheduler (Auto-Run Every 24 Hours)
        // This replaces the manual CLI script with a fully automated server-side loop.
        const { syncAllProviders, verifyAssetIntegrity } = await import('./lib/providers/provider-sync');

        const runSmartSyncScheduler = async () => {
            try {
                logger.info('[SmartSync] Starting scheduled Global Sync...');

                // 1. Pre-Flight Asset Scrub
                const preCheck = await verifyAssetIntegrity();
                if (preCheck.removed > 0) {
                    logger.warn(`[SmartSync] Pre-flight scrub removed ${preCheck.removed} corrupt assets.`);
                }

                // 2. Main Sync
                const results = await syncAllProviders();
                const failureCount = results.filter(r => r.error).length;

                logger.info(`[SmartSync] Sync completed. Success: ${results.length - failureCount}, Failed: ${failureCount}`);

                // 3. Post-Sync Check
                const postCheck = await verifyAssetIntegrity();
                if (postCheck.removed > 0) {
                    logger.warn(`[SmartSync] Post-sync scrub removed ${postCheck.removed} bad assets.`);
                }

            } catch (e) {
                logger.error('[SmartSync] Critical failure during scheduled sync:', e);
            } finally {
                // Schedule next run in 24 hours
                const delay = 24 * 60 * 60 * 1000;
                logger.info(`[SmartSync] Next sync scheduled in ${(delay / 1000 / 60 / 60).toFixed(1)} hours.`);
                setTimeout(runSmartSyncScheduler, delay);
            }
        };

        // Start initial sync after 24 hours (User requested no auto-start)
        const initialDelay = 24 * 60 * 60 * 1000;
        setTimeout(runSmartSyncScheduler, initialDelay);
        logger.info(`[Worker] Smart Sync scheduler initialized (First run in 24 hours)`);

    } catch (e) {
        logger.error('[Worker] Fatal startup error:', e);
        // Do NOT exit process in Next.js instrumentation
    }
}
