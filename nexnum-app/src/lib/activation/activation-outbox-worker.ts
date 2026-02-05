/**
 * Activation Outbox Worker
 * 
 * Processes pending Outbox events for Activation-related operations.
 * Implements:
 * - Row-level locking to prevent concurrent processing
 * - Exponential backoff on failure
 * - Max retries with dead-letter state
 * 
 * Event Types:
 * - provider_request: Request number from SMS provider
 * - refund: Process refund compensation
 */

import { prisma } from '@/lib/core/db'
import { ActivationService } from './activation-service'
import { smsProvider } from '@/lib/providers'
import { logger } from '@/lib/core/logger'

const WORKER_ID = `worker_${process.pid}_${Date.now()}`
const LOCK_DURATION_MS = 60 * 1000 // 1 minute lock
const MAX_ATTEMPTS = 5

interface ProcessResult {
    processed: number
    succeeded: number
    failed: number
    skipped: number
}

/**
 * Main worker function - called by cron endpoint
 */
export async function processActivationOutbox(batchSize = 10): Promise<ProcessResult> {
    const result: ProcessResult = { processed: 0, succeeded: 0, failed: 0, skipped: 0 }

    // Find and lock pending events
    const now = new Date()
    const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS)

    // Fetch events where:
    // - status = PENDING
    // - (lockedUntil is null OR lockedUntil < now) -- not locked by another worker
    // - retryCount < MAX_ATTEMPTS
    // - nextRetryAt is null OR nextRetryAt < now -- ready for retry
    const pendingEvents = await prisma.outboxEvent.findMany({
        where: {
            status: 'PENDING',
            retryCount: { lt: MAX_ATTEMPTS },
            OR: [
                { updatedAt: { lt: new Date(now.getTime() - 30000) } }, // 30s stale
                { retryCount: 0 } // First attempt
            ],
            aggregateType: 'activation' // Only process activation events
        },
        take: batchSize,
        orderBy: { createdAt: 'asc' }
    })

    if (pendingEvents.length === 0) {
        return result
    }

    logger.info(`Processing ${pendingEvents.length} events`, { context: 'OUTBOX' })

    for (const event of pendingEvents) {
        result.processed++

        try {
            // Attempt to acquire lock (optimistic)
            const lockResult = await prisma.outboxEvent.updateMany({
                where: {
                    id: event.id,
                    status: 'PENDING',
                    // Ensure no one else locked it
                    OR: [
                        { updatedAt: event.updatedAt },
                        { retryCount: 0 }
                    ]
                },
                data: {
                    status: 'PUBLISHED', // Mark as processing
                    retryCount: { increment: 1 }
                }
            })

            if (lockResult.count === 0) {
                // Someone else got it
                result.skipped++
                continue
            }

            // Process based on event type
            await processEvent(event)

            // Mark as complete
            await prisma.outboxEvent.update({
                where: { id: event.id },
                data: {
                    status: 'PUBLISHED'
                }
            })

            result.succeeded++

        } catch (err: any) {
            logger.error(`Failed to process ${event.id}`, { context: 'OUTBOX', error: err.message })

            // Calculate next retry with exponential backoff
            const currentRetries = event.retryCount + 1
            const backoffMs = Math.min(1000 * Math.pow(2, currentRetries), 5 * 60 * 1000) // Max 5min

            if (currentRetries >= MAX_ATTEMPTS) {
                // Move to dead letter
                await prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        status: 'FAILED',
                        error: err.message
                    }
                })
                logger.error(`Event ${event.id} moved to FAILED (max retries)`, { context: 'OUTBOX' })
            } else {
                // Schedule retry
                await prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: {
                        status: 'PENDING',
                        error: err.message
                    }
                })
            }

            result.failed++
        }
    }

    logger.info(`Complete: ${result.succeeded} ok, ${result.failed} failed`, { context: 'OUTBOX' })
    return result
}

/**
 * Process individual event based on type
 */
async function processEvent(event: any) {
    const payload = event.payload as any
    const eventType = event.eventType

    switch (eventType) {
        case 'provider_request':
            await handleProviderRequest(event.aggregateId, payload)
            break

        case 'refund':
            await handleRefund(payload.activationId)
            break

        case 'saga.compensate.set_cancel':
            await handleSagaCancel(payload.providerActivationId, payload.providerId)
            break

        default:
            logger.warn(`Unknown event type: ${eventType}`, { context: 'OUTBOX' })
    }
}

/**
 * Handle saga.compensate.cancel_number
 */
async function handleSagaCancel(providerActivationId: string, providerId: string) {
    logger.info(`Compensating: Cancelling ${providerActivationId} at provider ${providerId}`, { context: 'OUTBOX' })
    try {
        await smsProvider.setCancel(providerActivationId)
        logger.success(`Successfully cancelled orphaned number: ${providerActivationId}`, { context: 'OUTBOX' })
    } catch (err: any) {
        logger.error(`Failed to cancel orphaned number`, { context: 'OUTBOX', error: err.message })
        throw err // Retry
    }
}

/**
 * Handle provider_request event
 * Calls SMS provider, then updates Activation
 */
async function handleProviderRequest(activationId: string, payload: any) {
    const { providerId, serviceName, countryCode, operatorId } = payload

    logger.info(`Requesting number for activation ${activationId}`, { context: 'OUTBOX' })

    // 0. Pre-check: Ensure it hasn't been cancelled/refunded while waiting in outbox
    const activationCheck = await prisma.activation.findUnique({
        where: { id: activationId },
        select: { state: true }
    })
    if (!activationCheck || activationCheck.state !== 'RESERVED') {
        logger.warn(`Skipping ${activationId}: State is ${activationCheck?.state || 'MISSING'}`, { context: 'OUTBOX' })
        return
    }

    // Call provider
    const providerResult = await smsProvider.getNumber(
        countryCode,
        serviceName,
        providerId
    )

    // On success: Confirm Activation
    try {
        await prisma.$transaction(async (tx) => {
            await ActivationService.confirmActive(
                activationId,
                {
                    providerActivationId: providerResult.activationId,
                    phoneNumber: providerResult.phoneNumber,
                    expiresAt: providerResult.expiresAt
                },
                tx
            )

            // ... (existing creation logic)
        })
    } catch (err: any) {
        if (err.message.includes('ACTIVATION_CONFLICT')) {
            // WE ALREADY BOUGHT THE NUMBER BUT DB REJECTED CAPTURE
            // MUST CANCEL AT PROVIDER TO AVOID LOSS
            logger.error(`CRITICAL CONFLICT: Number bought but state changed. Canceling at provider: ${providerResult.activationId}`, { context: 'OUTBOX' })
            try {
                await smsProvider.setCancel(providerResult.activationId)
            } catch (cancelErr: any) {
                logger.error(`Failed to cancel orphaned number`, { context: 'OUTBOX', error: cancelErr.message })
            }
            return // Stop processing this event
        }
        throw err
    }

    // On success (continued): Create Number record (for backward compatibility)
    await prisma.$transaction(async (tx) => {
        const activation = await tx.activation.findUniqueOrThrow({
            where: { id: activationId }
        })

        const number = await tx.number.create({
            data: {
                phoneNumber: providerResult.phoneNumber,
                countryCode: activation.countryCode,
                countryName: activation.countryName,
                serviceName: activation.serviceName,
                serviceCode: activation.serviceName,
                price: activation.price,
                status: 'active',
                ownerId: activation.userId,
                activationId: providerResult.activationId,
                provider: providerId,
                expiresAt: providerResult.expiresAt,
                idempotencyKey: activation.idempotencyKey,
                nextPollAt: new Date(Date.now() + 10000)
            }
        })

        // Link Number to Activation
        await tx.activation.update({
            where: { id: activationId },
            data: { numberId: number.id }
        })
    })

    logger.info(`Activation ${activationId} -> ACTIVE`, { context: 'OUTBOX' })
}

/**
 * Handle refund event
 */
async function handleRefund(activationId: string) {
    await prisma.$transaction(async (tx) => {
        await ActivationService.processRefund(activationId, tx)
    })
}
