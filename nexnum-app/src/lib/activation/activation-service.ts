/**
 * Activation Service
 * 
 * Manages the Activation lifecycle using the State Machine pattern.
 * Handles creation, state transitions, and integrates with WalletService.
 */

import { prisma } from './db'
import { Prisma, ActivationState } from '@prisma/client'
import { WalletService } from './wallet'
import { canTransition, isRefundable } from './activation-state-machine'
import { logger } from './logger'

export interface CreateActivationInput {
    userId: string
    price: number
    serviceName: string
    countryCode: string
    countryName?: string
    operatorId?: string
    providerId: string
    idempotencyKey?: string
}

export interface ActivationResult {
    activationId: string
    state: ActivationState
    reservedTxId?: string
}

export class ActivationService {
    /**
     * Phase 1: Create Activation with Reserved Funds
     * 
     * 1. Reserve funds in wallet
     * 2. Create Activation record in RESERVED state
     * 3. Create OutboxEvent for provider request
     * 
     * @returns Activation ID for polling
     */
    static async createWithReservation(
        input: CreateActivationInput,
        tx?: Prisma.TransactionClient
    ): Promise<ActivationResult> {
        const client = tx || prisma

        // Idempotency check
        if (input.idempotencyKey) {
            const existing = await client.activation.findUnique({
                where: { idempotencyKey: input.idempotencyKey }
            })
            if (existing) {
                logger.info(`[Activation] Idempotent request: ${input.idempotencyKey}`)
                return {
                    activationId: existing.id,
                    state: existing.state,
                    reservedTxId: existing.reservedTxId || undefined
                }
            }
        }

        // Reserve Funds
        await WalletService.reserve(
            input.userId,
            input.price,
            'activation_reserve',
            `Reserve: ${input.serviceName}`,
            input.idempotencyKey ? `reserve_${input.idempotencyKey}` : undefined,
            client as any
        )

        // Create Activation
        const activation = await client.activation.create({
            data: {
                userId: input.userId,
                price: new Prisma.Decimal(input.price),
                state: 'RESERVED',
                serviceName: input.serviceName,
                countryCode: input.countryCode,
                countryName: input.countryName,
                operatorId: input.operatorId,
                providerId: input.providerId,
                idempotencyKey: input.idempotencyKey,
                reservedTxId: input.idempotencyKey ? `reserve_${input.idempotencyKey}` : undefined
            }
        })

        // Create Outbox Event for async provider request
        // Using the existing OutboxEvent model (outbox_events_v2)
        await client.outboxEvent.create({
            data: {
                aggregateType: 'activation',
                aggregateId: activation.id,
                eventType: 'provider_request',
                payload: {
                    activationId: activation.id,
                    providerId: input.providerId,
                    serviceName: input.serviceName,
                    countryCode: input.countryCode,
                    operatorId: input.operatorId
                },
                status: 'PENDING'
            }
        })

        logger.info(`[Activation] Created ${activation.id} in RESERVED state`)

        return {
            activationId: activation.id,
            state: activation.state,
            reservedTxId: activation.reservedTxId || undefined
        }
    }

    /**
     * Transition Activation to ACTIVE state (Provider Success)
     */
    static async confirmActive(
        activationId: string,
        providerData: {
            providerActivationId: string
            phoneNumber: string
            expiresAt: Date
        },
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma

        const activation = await client.activation.findUniqueOrThrow({
            where: { id: activationId }
        })

        if (!canTransition(activation.state, 'ACTIVE')) {
            throw new Error(`Cannot transition ${activation.state} -> ACTIVE`)
        }

        // Commit wallet funds
        const capturedTx = await WalletService.commit(
            activation.userId,
            activation.price.toNumber(),
            activationId,
            `Purchase: ${activation.serviceName}`,
            `capture_${activationId}`,
            client as any
        )

        // Update Activation
        const updated = await client.activation.update({
            where: { id: activationId },
            data: {
                state: 'ACTIVE',
                providerActivationId: providerData.providerActivationId,
                phoneNumber: providerData.phoneNumber,
                expiresAt: providerData.expiresAt,
                capturedTxId: capturedTx.id
            }
        })

        logger.info(`[Activation] ${activationId} -> ACTIVE (${providerData.phoneNumber})`)
        return updated
    }

    /**
     * Transition Activation to FAILED state (Provider Failure)
     */
    static async markFailed(
        activationId: string,
        reason: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma

        const activation = await client.activation.findUniqueOrThrow({
            where: { id: activationId }
        })

        if (!canTransition(activation.state, 'FAILED')) {
            throw new Error(`Cannot transition ${activation.state} -> FAILED`)
        }

        // Rollback reservation
        await WalletService.rollback(
            activation.userId,
            activation.price.toNumber(),
            activationId,
            `Failed: ${reason}`,
            client as any
        )

        // Update Activation
        const updated = await client.activation.update({
            where: { id: activationId },
            data: { state: 'FAILED' }
        })

        logger.info(`[Activation] ${activationId} -> FAILED: ${reason}`)
        return updated
    }

    /**
     * Process Refund for eligible states
     */
    static async processRefund(
        activationId: string,
        tx?: Prisma.TransactionClient
    ) {
        const client = tx || prisma

        const activation = await client.activation.findUniqueOrThrow({
            where: { id: activationId }
        })

        if (!isRefundable(activation.state as any)) {
            throw new Error(`State ${activation.state} is not refundable`)
        }

        if (!canTransition(activation.state, 'REFUNDED')) {
            throw new Error(`Cannot transition ${activation.state} -> REFUNDED`)
        }

        // Issue refund
        const refundTx = await WalletService.refund(
            activation.userId,
            activation.price.toNumber(),
            'refund',
            activationId,
            `Refund: ${activation.state} ${activation.serviceName}`,
            `refund_${activationId}`,
            client as any
        )

        // Update Activation
        const updated = await client.activation.update({
            where: { id: activationId },
            data: {
                state: 'REFUNDED',
                refundTxId: refundTx.id
            }
        })

        logger.info(`[Activation] ${activationId} -> REFUNDED`)
        return updated
    }

    /**
     * Get Activation status for frontend polling
     */
    static async getStatus(activationId: string) {
        const activation = await prisma.activation.findUnique({
            where: { id: activationId },
            select: {
                id: true,
                state: true,
                phoneNumber: true,
                expiresAt: true,
                numberId: true,
                createdAt: true,
                updatedAt: true
            }
        })
        return activation
    }
}
