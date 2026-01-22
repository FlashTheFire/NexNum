import { prisma } from '@/lib/core/db'
import crypto from 'crypto'

const MAX_RETRIES = 5
const BATCH_SIZE = 10
const WORKER_INTERVAL_MS = 5000 // 5 seconds

export class WebhookWorker {
    private isRunning = false
    private intervalId: NodeJS.Timeout | null = null

    /**
     * Start the worker
     */
    start() {
        if (this.isRunning) return
        this.isRunning = true
        console.log('[WebhookWorker] Started')

        this.intervalId = setInterval(() => {
            this.processBatch().catch(err => {
                console.error('[WebhookWorker] Batch error:', err)
            })
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
        console.log('[WebhookWorker] Stopped')
    }

    /**
     * Process a batch of pending deliveries
     */
    private async processBatch() {
        // 1. Lock/Fetch pending jobs
        // In a real queue we'd pop jobs. Here we select PENDING deliveries with past nextRetryAt
        const pendingDeliveries = await prisma.webhookDelivery.findMany({
            where: {
                status: 'pending',
                nextRetryAt: { lte: new Date() }
            },
            take: BATCH_SIZE,
            include: {
                webhook: true
            }
        })

        if (pendingDeliveries.length === 0) return

        console.log(`[WebhookWorker] Processing ${pendingDeliveries.length} deliveries`)

        // 2. Process each
        await Promise.all(pendingDeliveries.map(delivery => this.processDelivery(delivery)))
    }

    /**
     * Process a single delivery attempt
     */
    private async processDelivery(delivery: any) { // Type 'any' for simplicity with include
        const startTime = Date.now()

        try {
            // Generate Signature
            const payloadString = JSON.stringify(delivery.payload)
            const signature = crypto
                .createHmac('sha256', delivery.webhook.secret)
                .update(payloadString)
                .digest('hex')

            // Send Request
            const response = await fetch(delivery.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-NexNum-Event': delivery.event,
                    'X-NexNum-Signature': `sha256=${signature}`,
                    'User-Agent': 'NexNum-Webhook/1.0'
                },
                body: payloadString,
                signal: AbortSignal.timeout(10000) // 10s timeout
            })

            const durationMs = Date.now() - startTime
            const responseBody = await response.text() // Capture response for debugging

            if (response.ok) {
                // SUCCESS
                await prisma.webhookDelivery.update({
                    where: { id: delivery.id },
                    data: {
                        status: 'delivered',
                        responseCode: response.status,
                        responseBody: responseBody.slice(0, 1000), // Truncate
                        deliveredAt: new Date(),
                        durationMs: durationMs
                    }
                })

                // Update success stats on webhook
                await prisma.webhook.update({
                    where: { id: delivery.webhookId },
                    data: { lastSuccessAt: new Date(), failCount: 0 }
                })
            } else {
                // FAILED RESPONSE (4xx/5xx)
                await this.handleFailure(delivery, startTime, response.status, `HTTP ${response.status}: ${responseBody.slice(0, 200)}`)
            }

        } catch (error: any) {
            // NETWORK ERROR
            await this.handleFailure(delivery, startTime, undefined, error.message || 'Network Error')
        }
    }

    /**
     * Handle failure and schedule retry
     */
    private async handleFailure(delivery: any, startTime: number, code?: number, errorMsg?: string) {
        const durationMs = Date.now() - startTime
        const attempt = delivery.attempts + 1

        if (attempt >= MAX_RETRIES) {
            // MAX RETRIES REACHED -> FAIL PERMANENTLY
            await prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: 'failed',
                    responseCode: code,
                    responseBody: errorMsg,
                    attempts: attempt,
                    durationMs,
                    nextRetryAt: null // Stop retrying
                }
            })

            // Update failure count on webhook
            await prisma.webhook.update({
                where: { id: delivery.webhookId },
                data: { failCount: { increment: 1 } }
            })
        } else {
            // RETRY LATER (Exponential Backoff: 10s, 30s, 60s, 5m, 15m)
            const backoffMinutes = [0.1, 0.5, 1, 5, 15][attempt - 1] || 15
            const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000)

            await prisma.webhookDelivery.update({
                where: { id: delivery.id },
                data: {
                    status: 'pending', // Keep pending
                    responseCode: code,
                    responseBody: `Attempt ${attempt} failed: ${errorMsg}`,
                    attempts: attempt,
                    durationMs,
                    nextRetryAt: nextRetry
                }
            })
        }
    }
}

// Singleton instance (for simple in-process worker)
export const webhookWorker = new WebhookWorker()
