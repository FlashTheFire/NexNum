/**
 * OTP Poller Service
 * 
 * Central polling service with:
 * - Exponential backoff (1s → 2s → 4s → 8s)
 * - Parallel polling with semaphore control
 * - Per-provider rate limiting
 * - Result caching (Redis)
 * - Integration with DynamicProvider
 */

import { DynamicProvider } from '@/lib/dynamic-provider'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { CodeExtractor } from './code-extractor'
import {
    PollingConfig,
    PollingJob,
    SmsResult,
    ActivationInfo,
    ActivationStatus,
    DEFAULT_POLLING_CONFIG,
} from './types'
import { Semaphore } from '@/lib/async-utils'

// ============================================
// POLLER CLASS
// ============================================

export class OtpPoller {
    private config: PollingConfig
    private semaphore: Semaphore
    private activeJobs: Map<string, PollingJob> = new Map()
    private providers: Map<string, DynamicProvider> = new Map()

    constructor(config?: Partial<PollingConfig>) {
        this.config = { ...DEFAULT_POLLING_CONFIG, ...config }
        this.semaphore = new Semaphore(this.config.maxConcurrent)
    }

    /**
     * Start polling for a number
     */
    async startPolling(
        numberId: string,
        activationId: string,
        provider: string,
        userId: string,
        priority: number = 5
    ): Promise<void> {
        const jobId = `${provider}:${activationId}`

        // Check if already polling
        if (this.activeJobs.has(jobId)) {
            logger.debug('Already polling this activation', { jobId })
            return
        }

        // Create job
        const job: PollingJob = {
            id: jobId,
            numberId,
            activationId,
            provider,
            userId,
            priority,
            createdAt: new Date(),
            attempts: 0,
            currentInterval: this.config.initialInterval,
            nextPollAt: new Date(),
            status: 'pending',
        }

        this.activeJobs.set(jobId, job)
        logger.info('Started polling job', { jobId, provider })

        // Start polling loop
        this.pollLoop(job).catch(err => {
            logger.error('Polling loop error', { jobId, error: err.message })
            this.activeJobs.delete(jobId)
        })
    }

    /**
     * Polling loop with exponential backoff
     */
    private async pollLoop(job: PollingJob): Promise<void> {
        const startTime = Date.now()

        while (job.status === 'pending' || job.status === 'polling') {
            // Check timeout
            if (Date.now() - startTime > this.config.maxDuration) {
                logger.warn('Polling timeout', { jobId: job.id })
                job.status = 'expired'
                this.activeJobs.delete(job.id)

                // Mark number as expired
                await this.markNumberExpired(job.numberId)
                break
            }

            // Wait for next poll time
            const waitTime = job.nextPollAt.getTime() - Date.now()
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime))
            }

            // Acquire semaphore
            await this.semaphore.acquire()

            try {
                job.status = 'polling'
                job.attempts++

                // Poll provider
                const result = await this.pollProvider(job)

                if (result) {
                    // SMS received!
                    logger.info('SMS received', { jobId: job.id, code: result.code })
                    job.status = 'completed'
                    this.activeJobs.delete(job.id)

                    // Store SMS
                    await this.storeSms(job.numberId, result)

                    // Cache result
                    await this.cacheResult(job.numberId, result)

                    break
                }

                // No SMS yet - calculate next interval
                job.currentInterval = Math.min(
                    job.currentInterval * this.config.backoffMultiplier,
                    this.config.maxInterval
                )
                job.nextPollAt = new Date(Date.now() + job.currentInterval)
                job.status = 'pending'

                logger.debug('No SMS yet, will retry', {
                    jobId: job.id,
                    nextInterval: job.currentInterval,
                    attempts: job.attempts,
                })
            } catch (error: any) {
                logger.error('Poll error', {
                    jobId: job.id,
                    error: error.message,
                })

                // On error, backoff more aggressively
                job.currentInterval = Math.min(
                    job.currentInterval * 2,
                    this.config.maxInterval
                )
                job.nextPollAt = new Date(Date.now() + job.currentInterval)
                job.status = 'pending'
            } finally {
                this.semaphore.release()
            }
        }
    }

    /**
     * Poll a single provider
     */
    private async pollProvider(job: PollingJob): Promise<SmsResult | null> {
        // Get provider instance
        const provider = await this.getProvider(job.provider)
        if (!provider) {
            throw new Error(`Provider not found: ${job.provider}`)
        }

        // Call getStatus
        const statusResult = await provider.getStatus(job.activationId)

        // Check if SMS received in StatusResult (from sms-providers/types.ts)
        if (statusResult.status === 'received') {
            const msgs = statusResult.messages || []
            const firstMsg = msgs[0]

            // Check content in first message or fallback properties (if any)
            const smsText = firstMsg?.content || (statusResult as any).code // Fallback for some providers if they return code directly in top level (unlikely with standardized types but being safe)

            if (!smsText) {
                logger.warn('No SMS text in response', { jobId: job.id })
                return null
            }

            // Get number details for service code
            const number = await prisma.number.findUnique({
                where: { id: job.numberId },
                select: { serviceCode: true },
            })

            // Extract code
            const extraction = CodeExtractor.extract(
                smsText,
                number?.serviceCode || undefined
            )

            return {
                id: `${job.provider}:${job.activationId}:${Date.now()}`,
                numberId: job.numberId,
                activationId: job.activationId,
                sender: firstMsg?.sender || (statusResult as any).sender || 'Unknown',
                content: smsText,
                code: extraction?.code || firstMsg?.code || (statusResult as any).code,
                confidence: extraction?.confidence,
                receivedAt: firstMsg?.receivedAt || new Date(),
                provider: job.provider,
                rawPayload: statusResult,
            }
        }

        // Check if canceled or expired
        if (statusResult.status === 'cancelled' || statusResult.status === 'expired') {
            job.status = 'failed'
            throw new Error(`Activation ${statusResult.status}`)
        }

        return null
    }

    /**
     * Store SMS in database
     */
    private async storeSms(numberId: string, sms: SmsResult): Promise<void> {
        await prisma.smsMessage.create({
            data: {
                numberId,
                sender: sms.sender,
                content: sms.content,
                code: sms.code,
                receivedAt: sms.receivedAt,
                // New fields from enhanced schema
                provider: sms.provider,
                rawPayload: sms.rawPayload as any,
                extractedCode: sms.code,
                confidence: sms.confidence,
            },
        })

        // Update number status
        await prisma.number.update({
            where: { id: numberId },
            data: { status: 'active' },
        })
    }

    /**
     * Cache SMS result
     */
    private async cacheResult(numberId: string, sms: SmsResult): Promise<void> {
        const cacheKey = `sms:${numberId}`
        await redis.set(
            cacheKey,
            JSON.stringify(sms),
            { ex: this.config.cacheTtl }
        )
    }

    /**
     * Mark number as expired
     */
    private async markNumberExpired(numberId: string): Promise<void> {
        await prisma.number.update({
            where: { id: numberId },
            data: { status: 'expired' },
        })
    }

    /**
     * Get provider instance (cached)
     */
    private async getProvider(providerName: string): Promise<DynamicProvider | null> {
        if (this.providers.has(providerName)) {
            return this.providers.get(providerName)!
        }

        const providerConfig = await prisma.provider.findUnique({
            where: { name: providerName },
        })

        if (!providerConfig) return null

        const instance = new DynamicProvider(providerConfig)
        this.providers.set(providerName, instance)
        return instance
    }

    /**
     * Stop polling for a job
     */
    async stopPolling(activationId: string): Promise<void> {
        // Find job
        const job = Array.from(this.activeJobs.values()).find(
            j => j.activationId === activationId
        )

        if (job) {
            job.status = 'failed'
            this.activeJobs.delete(job.id)
            logger.info('Stopped polling job', { jobId: job.id })
        }
    }

    /**
     * Get polling status
     */
    getStatus(activationId: string): PollingJob | undefined {
        return Array.from(this.activeJobs.values()).find(
            j => j.activationId === activationId
        )
    }

    /**
     * Get all active jobs
     */
    getActiveJobs(): PollingJob[] {
        return Array.from(this.activeJobs.values())
    }

    /**
     * Cleanup completed/failed jobs
     */
    cleanup(): void {
        for (const [id, job] of this.activeJobs.entries()) {
            if (job.status === 'completed' || job.status === 'failed') {
                this.activeJobs.delete(id)
            }
        }
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const otpPoller = new OtpPoller()
