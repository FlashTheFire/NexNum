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

    } catch (e) {
        logger.error('[Worker] Fatal startup error:', e);
        process.exit(1);
    }
}

startWorker();
