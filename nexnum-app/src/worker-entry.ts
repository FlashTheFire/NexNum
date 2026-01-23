import dotenv from 'dotenv';
// Load environment variables immediately
dotenv.config();

import { queue, QUEUES } from './lib/core/queue';
import { prisma } from './lib/core/db';
import { logger } from './lib/core/logger';
import { DynamicProvider } from './lib/providers/dynamic-provider';
import { DynamicWebhookHandler } from './lib/webhooks/handlers/dynamic';

async function startWorker() {
    logger.info('[Worker] Starting background worker service...');

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
                        continue; // Move to next job, or maybe fail?
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

        // JOB: Inbox Polling (Legacy/Fallback)
        const { processInboxBatch } = await import('./workers/inbox-worker');

        // Polling Loop
        const runPolling = async () => {
            try {
                const result = await processInboxBatch();
                if (result.processed > 0 || result.activeNumbers > 0) {
                    setTimeout(runPolling, 2000);
                } else {
                    setTimeout(runPolling, 10000);
                }
            } catch (e) {
                logger.error('[Worker] Polling loop crashed:', e);
                setTimeout(runPolling, 30000);
            }
        };

        runPolling();
        logger.info('[Worker] Inbox polling loop started');

        // JOB: Smart Sync Scheduler (Auto-Run Every 6 Hours)
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
                // Schedule next run in 6 hours
                const delay = 6 * 60 * 60 * 1000;
                logger.info(`[SmartSync] Next sync scheduled in ${delay / 1000 / 60} minutes.`);
                setTimeout(runSmartSyncScheduler, delay);
            }
        };

        // Start initial sync after 1 minute (to allow worker to stabilize)
        setTimeout(runSmartSyncScheduler, 60 * 1000);
        logger.info('[Worker] Smart Sync scheduler initialized');

    } catch (e) {
        logger.error('[Worker] Fatal startup error:', e);
        process.exit(1);
    }
}

startWorker();
