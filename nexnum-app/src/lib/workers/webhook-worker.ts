import { prisma } from '@/lib/core/db'
import crypto from 'crypto'
import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/core/logger'
import { webhook_deliveries_total, webhook_delivery_duration_seconds } from '@/lib/metrics'

const MAX_RETRIES = 5
const BATCH_SIZE = 50 // Increased for high-throughput
const WORKER_INTERVAL_MS = 2000 // Tighter responsiveness
const CONCURRENCY_LIMIT = 10   // More simultaneous deliveries

export class WebhookWorker {
    private isRunning = false
    private intervalId: NodeJS.Timeout | null = null
    private activeDeliveries = 0

    /**
     * Start the worker
     */
    start() {
        if (this.isRunning) return
        this.isRunning = true
        logger.info('[WebhookWorker] Initiating industrial delivery engine')

        this.intervalId = setInterval(() => {
            if (this.isRunning) {
                this.processBatch().catch(err => {
                    logger.error('[WebhookWorker] Batch processing failure', { error: err.message })
                })
            }
        }, WORKER_INTERVAL_MS)
    }

    /**
     * Stop the worker
     */
    stop() {
        this.isRunning = false
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
        logger.info('[WebhookWorker] Shutting down delivery engine')
    }

    /**
     * Process a batch of pending deliveries
     */
    private async processBatch() {
        if (this.activeDeliveries >= CONCURRENCY_LIMIT) return

        // Picking next pending jobs with prioritized delivery
        const pendingDeliveries = await prisma.webhookDelivery.findMany({
            where: {
                status: 'pending',
                nextRetryAt: { lte: new Date() }
            },
            take: BATCH_SIZE,
            orderBy: [{ createdAt: 'asc' }],
            include: {
                webhook: {
                    select: {
                        id: true,
                        url: true,
                        secret: true,
                        userId: true
                    }
                }
            }
        })

        if (pendingDeliveries.length === 0) return

        // Parallel processing with concurrency control
        for (const delivery of pendingDeliveries) {
            if (this.activeDeliveries >= CONCURRENCY_LIMIT) break

            this.activeDeliveries++
            this.processDelivery(delivery).finally(() => {
                this.activeDeliveries--
            })
        }
    }

    /**
     * Process a single delivery attempt
     */
    private async processDelivery(delivery: any) {
        const startTime = Date.now()
        let forensicLog = `Attempt ${delivery.attempts + 1} at ${new Date().toISOString()}\n`

        try {
            // 1. Payload Serialization & Signature
            const payloadString = JSON.stringify(delivery.payload)
            const decryptedSecret = delivery.webhook.secret
                ? decrypt(delivery.webhook.secret)
                : process.env.WEBHOOK_DEFAULT_SECRET || 'nexnum_dev_secret'

            const timestamp = Math.floor(Date.now() / 1000)

            // Standardized Industrial Signature: HMAC-SHA256(timestamp + "." + payload)
            const signature = crypto
                .createHmac('sha256', decryptedSecret)
                .update(`${timestamp}.${payloadString}`)
                .digest('hex')

            // 2. HTTP Transmission with Trace Meta
            logger.request('WEBHOOK_OUT', 'POST', delivery.webhook.url, {
                event: delivery.event,
                deliveryId: delivery.id,
                userId: delivery.webhook.userId
            })

            const response = await fetch(delivery.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-NexNum-Event': delivery.event,
                    'X-NexNum-Signature': signature,
                    'X-NexNum-Timestamp': String(timestamp),
                    'X-NexNum-Delivery-ID': delivery.id,
                    'User-Agent': 'NexNum-Webhook/2.0 (Forensic; Industrial)'
                },
                body: payloadString,
                signal: AbortSignal.timeout(10000) // 10s strict timeout
            })

            const durationMs = Date.now() - startTime
            const responseBody = await response.text()

            logger.response('WEBHOOK_OUT', 'POST', delivery.webhook.url, response.status, {
                durationMs,
                deliveryId: delivery.id
            })

            // 3. Status Finalization & Instrumentation
            if (response.ok) {
                await this.finalizeSuccess(delivery, response.status, responseBody, durationMs)

                // Metrics: Success
                webhook_deliveries_total.inc({
                    event: delivery.event,
                    status: 'success',
                    response_code: String(response.status)
                })
                webhook_delivery_duration_seconds.observe({ event: delivery.event }, durationMs / 1000)

            } else {
                forensicLog += `[WARN] Remote server responded with ${response.status}: ${responseBody.slice(0, 500)}\n`
                await this.handleFailure(delivery, durationMs, forensicLog, response.status)

                // Metrics: Failure
                webhook_deliveries_total.inc({
                    event: delivery.event,
                    status: 'error',
                    response_code: String(response.status)
                })
            }

        } catch (error: any) {
            const durationMs = Date.now() - startTime
            forensicLog += `[CRITICAL] Network exception: ${error.message}\n`

            await this.handleFailure(delivery, durationMs, forensicLog)

            // Metrics: Error
            webhook_deliveries_total.inc({
                event: delivery.event,
                status: 'error',
                response_code: 'network_failure'
            })
        }
    }

    private async finalizeSuccess(delivery: any, code: number, body: string, durationMs: number) {
        await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
                status: 'delivered',
                responseCode: code,
                responseBody: `OK: ${body.slice(0, 1000)}`,
                deliveredAt: new Date(),
                durationMs
            }
        })

        await prisma.webhook.update({
            where: { id: delivery.webhookId },
            data: { lastSuccessAt: new Date(), failCount: 0 }
        })
    }

    /**
     * Exponential Backoff & Circuit-Aware Retries
     */
    private async handleFailure(delivery: any, durationMs: number, forensicLog: string, code?: number) {
        const attempt = delivery.attempts + 1
        const isTerminal = attempt >= MAX_RETRIES

        if (isTerminal) {
            logger.error(`[WebhookWorker] Delivery terminal failure for ID: ${delivery.id}`, { attempts: attempt })

            await prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: 'failed',
                    responseCode: code,
                    responseBody: forensicLog.slice(0, 2048),
                    attempts: attempt,
                    durationMs,
                    nextRetryAt: null
                }
            })

            await prisma.webhook.update({
                where: { id: delivery.webhookId },
                data: { failCount: { increment: 1 } }
            })
        } else {
            // Intelligent Backoff: 15s, 5m, 30m, 2h, 6h
            const delaySchedule = [15, 300, 1800, 7200, 21600]
            const nextDelay = delaySchedule[attempt - 1] || 21600
            const nextRetryAt = new Date(Date.now() + nextDelay * 1000)

            await prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: 'pending',
                    responseCode: code,
                    responseBody: forensicLog.slice(0, 2048),
                    attempts: attempt,
                    durationMs,
                    nextRetryAt
                }
            })
        }
    }
}

export const webhookWorker = new WebhookWorker()
