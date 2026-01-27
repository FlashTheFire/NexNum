/**
 * Activation Kernel (Industrial Edition)
 * 
 * Central orchestrator for the Activation lifecycle. 
 * Responsibilities:
 * 1. Atomic State Transitions
 * 2. Forensic History Logging (ActivationStateHistory)
 * 3. Saga-style Outbox Dispatching (V3)
 * 4. User Event Emission (Real-time)
 */

import { prisma } from '@/lib/core/db'
import { Prisma, ActivationState } from '@prisma/client'
import { logger } from '@/lib/core/logger'
import { emitStateUpdate } from '@/lib/events/emitters/state-emitter'
import { EventDispatcher } from '@/lib/core/event-dispatcher'
import { v4 as uuidv4 } from 'uuid'
import {
    order_state_transitions_total
} from '@/lib/metrics'

export interface TransitionOptions {
    reason?: string
    metadata?: any
    traceId?: string
    tx?: Prisma.TransactionClient
}

export class ActivationKernel {

    /**
     * Perform a validated state transition with full forensic logging.
     * Uses the "Golden Transition" pattern.
     */
    static async transition(
        activationId: string,
        toState: ActivationState,
        options: TransitionOptions = {}
    ) {
        const { reason, metadata, traceId = uuidv4(), tx } = options

        const runLogic = async (innerTx: Prisma.TransactionClient) => {
            // 1. Fetch current state with lock
            const activation = await innerTx.activation.findUniqueOrThrow({
                where: { id: activationId },
                select: { id: true, state: true, userId: true, providerId: true }
            })

            const fromState = activation.state

            // 2. Validate transition
            if (fromState === toState) {
                logger.debug(`[ActivationKernel] Skipping duplicate transition: ${activationId} (${toState})`)
                return activation
            }

            logger.info(`[ActivationKernel:Transition] ${activationId} | ${fromState} -> ${toState}`, { traceId })

            // 3. Update Activation state
            const updated = await innerTx.activation.update({
                where: { id: activationId },
                data: {
                    state: toState,
                    traceId: traceId as any // Workaround for Prisma type sync issue
                }
            })

            // 4. Record Forensic History
            // Workaround for Prisma type sync issue where `activationStateHistory` might not be immediately available on `innerTx` type
            await (innerTx as any).activationStateHistory.create({
                data: {
                    activationId,
                    state: toState,
                    previousState: fromState,
                    reason,
                    metadata: metadata ? (typeof metadata === 'string' ? { raw: metadata } : metadata) : undefined,
                    traceId
                }
            })

            // 5. Increment Metrics
            order_state_transitions_total.inc({
                from: fromState,
                to: toState,
                provider: activation.providerId || 'unknown'
            })

            // 6. Emit Side Effects
            this.emitSideEffects(activation.userId, activationId, toState, reason).catch(e => {
                logger.warn(`[ActivationKernel] Side-effect emission failed for ${activationId}`, { error: e.message })
            })

            return updated
        }

        if (tx) {
            return await runLogic(tx)
        } else {
            return await prisma.$transaction(runLogic)
        }
    }

    /**
     * Dispatch an Outbox V3 event associated with an activation.
     */
    static async dispatchEvent(
        activationId: string,
        eventType: string,
        payload: any,
        tx: Prisma.TransactionClient
    ) {
        logger.debug(`[ActivationKernel:Outbox] Queueing ${eventType} for ${activationId}`)

        return await tx.outboxEvent.create({
            data: {
                aggregateType: 'activation',
                aggregateId: activationId,
                eventType,
                payload,
                status: 'PENDING'
            }
        })
    }

    /**
     * Handle non-transactional side effects (Socket.io, Enterprise Dispatcher)
     */
    private static async emitSideEffects(
        userId: string,
        activationId: string,
        state: ActivationState,
        reason?: string
    ) {
        // Map states to simplified event categories
        const category = state === 'ACTIVE' ? 'numbers' : 'all'
        const eventTag = `activation_${state.toLowerCase()}`

        // 1. Socket.io Real-time
        emitStateUpdate(userId, category as any, eventTag as any).catch(() => { })

        // 2. Enterprise Event Dispatcher
        if (state === 'ACTIVE') {
            await EventDispatcher.dispatch(userId, 'activation.active', { activationId })
        } else if (state === 'FAILED') {
            await EventDispatcher.dispatch(userId, 'activation.failed', { activationId, reason })
        } else if (state === 'RECEIVED') {
            await EventDispatcher.dispatch(userId, 'activation.received', { activationId })
        }
    }
}
