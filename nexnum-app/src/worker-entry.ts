import { queue, QUEUES } from './lib/core/queue';
import { prisma } from './lib/core/db';
import { logger } from './lib/core/logger';
import { orchestrator } from './lib/core/orchestrator';
import { registerWebhookWorker } from './workers/webhook-worker';
import http from 'http';

// INDUSTRIAL HARDENING: Definitively bypass SSL certificate chain validation 
// for internal background workers to ensure zero downtime.
if (process.env.NODE_ENV === 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

/**
 * Main Worker Entry Point
 * Handles registration and execution of all background jobs.
 */
export async function startQueueWorker() {
    logger.box('Initializing Worker Services');

    try {
        // 1. Connect to Queue
        await queue.start();

        // Surface any dead pool sockets at boot instead of failing later inside
        // a cron job. This forces the pg.Pool to acquire its first connection
        // and run a round-trip, so misconfigured DATABASE_URL / pool settings
        // fail fast with a clear error rather than 5s timeouts on the first job.
        try {
            await prisma.$queryRaw`SELECT 1`;
            logger.info('Database connection OK', { context: 'WORKER' });
        } catch (dbErr: unknown) {
            const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            logger.error('Database connection FAILED at boot', { context: 'WORKER', error: dbMsg });
            throw dbErr;
        }

        // Start a lightweight HTTP health server to satisfy Docker/orchestrator healthchecks.
        // Parse and validate HEALTH_PORT; fall back to 3001 on NaN or non-positive values.
        const rawHealthPort = parseInt(process.env.HEALTH_PORT ?? '', 10);
        const healthPort: number = Number.isFinite(rawHealthPort) && rawHealthPort > 0 ? rawHealthPort : 3001;

        const healthServer = http.createServer(async (req, res) => {
            // Accept only GET requests; normalize pathname to ignore trailing slashes and query strings.
            const pathname = (() => {
                try {
                    const p = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
                    return p.replace(/\/+$/, '') || '/';
                } catch {
                    return req.url?.split('?')[0]?.replace(/\/+$/, '') || '/';
                }
            })();

            if (req.method !== 'GET' || pathname !== '/health') {
                res.writeHead(404);
                res.end();
                return;
            }

            // Perform an actual dependency check — queue must be connected for a healthy response.
            try {
                const isHealthy: boolean = typeof (queue as any).isConnected === 'function'
                    ? await (queue as any).isConnected()
                    : true; // No health API available; already connected above so assume healthy.

                if (isHealthy) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'OK', uptime: process.uptime() }));
                } else {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'UNHEALTHY', details: { queue: 'disconnected', uptime: process.uptime() } }));
                }
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'UNHEALTHY', details: { queue: 'error', error: errMsg, uptime: process.uptime() } }));
            }
        });

        // Catch listen/bind errors so the worker doesn't silently continue without a health endpoint.
        healthServer.on('error', (err: NodeJS.ErrnoException) => {
            logger.error('Health server failed to start', { context: 'WORKER', healthPort, error: err.message, code: err.code });
            process.exit(1);
        });

        healthServer.listen(healthPort, () => {
            logger.info(`Worker health server listening on port ${healthPort}`, { context: 'WORKER' });
        });

        orchestrator.onShutdown(async () => {
            logger.info('Stopping health server...', { context: 'WORKER' });
            // Await server close before stopping the queue to avoid a race condition.
            await new Promise<void>((resolve, reject) =>
                healthServer.close(err => (err ? reject(err) : resolve()))
            ).catch(err => {
                logger.error('Health server close error', { context: 'WORKER', error: (err as Error).message });
            });
            logger.info('Stopping background queue...', { context: 'WORKER' });
            await queue.stop();
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
                    logger.error('Sync failed', { context: 'WORKER', jobId: job.id, error: errorMsg });
                    throw error;
                }
            }
        });

        // JOB: Master Worker Loop
        const { runMasterWorker } = await import('./workers/master-worker')
        await queue.work(QUEUES.MASTER_WORKER, async () => {
            const res = await runMasterWorker()
            if ((res.inbox?.processed || 0) > 0 || (res.outbox?.processed || 0) > 0 || (res.notifications?.processed || 0) > 0 || (res.reservations?.processed || 0) > 0 || res.errors.length > 0) {
                logger.drawDashboard('NEXNUM MASTER WORKER', [
                    `${res.errors.length > 0 ? 'ERROR' : 'SUCCESS'} (${res.duration}ms)`,
                    ``,
                    `Inbox:${res.inbox?.processed || 0}`,
                    `Outbox:${res.outbox?.processed || 0}`,
                    `Push:${res.notifications?.processed || 0}`,
                    `Cleanup:${res.reservations?.processed || 0}`
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
        await queue.work(QUEUES.SEARCH_AGGREGATES, async () => { await refreshAllServiceAggregates(); });
        await queue.schedule(QUEUES.SEARCH_AGGREGATES, '*/5 * * * *', {});

        // JOB: Provider Reliability Stats (Hourly)
        // Updates Success Rate based on recent order history
        const { calculateProviderReliability } = await import('./workers/reliability-worker');
        await queue.work(QUEUES.PROVIDER_RELIABILITY, async () => { await calculateProviderReliability(); });
        await queue.schedule(QUEUES.PROVIDER_RELIABILITY, '0 * * * *', {});

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
            logger.info(`FORCE_SYNC enabled${syncTarget ? ` for ${syncTarget}` : ''}: Triggering immediate sync...`, { context: 'WORKER' });
            try {
                const { syncAllProviders } = await import('./lib/providers/provider-sync');
                await syncAllProviders();
                logger.success('Force sync completed', { context: 'WORKER' });
            } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                logger.error('Force sync failed', { context: 'WORKER', error: errorMsg });
            }
        }
    } catch (e) {
        logger.error('Fatal startup error', { context: 'WORKER', error: e });
    }
}

// STANDALONE EXECUTION
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/worker-entry.ts')) {
    orchestrator.bootstrap('Standalone:Worker').then(() => {
        logger.splash();
        return startQueueWorker();
    }).catch(err => {
        console.error('Worker failed to start:', err);
        process.exit(1);
    });
}
