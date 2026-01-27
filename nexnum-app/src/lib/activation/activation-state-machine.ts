import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { createOutboxEvent } from './outbox'

/**
 * Activation Lifecycle Engine (Industrial Edition)
 * 
 * Encompasses both the state transition logic and the 
 * side-effect-aware transition engine.
 */

export type ActivationState =
    | 'INIT'
    | 'RESERVED'
    | 'ACTIVE'
    | 'RECEIVED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'FAILED'
    | 'REFUNDED'

/**
 * State Metadata for UI/Logging
 */
export const STATE_METADATA: Record<ActivationState, { label: string; color: string; description: string }> = {
    INIT: { label: 'Initializing', color: 'gray', description: 'Activation request received' },
    RESERVED: { label: 'Pending', color: 'yellow', description: 'Funds reserved, awaiting provider' },
    ACTIVE: { label: 'Active', color: 'emerald', description: 'Number is active and waiting for SMS' },
    RECEIVED: { label: 'Completed', color: 'emerald', description: 'SMS received successfully' },
    EXPIRED: { label: 'Expired', color: 'orange', description: 'Number has expired' },
    CANCELLED: { label: 'Cancelled', color: 'red', description: 'Activation was cancelled' },
    FAILED: { label: 'Failed', color: 'red', description: 'Activation failed' },
    REFUNDED: { label: 'Refunded', color: 'blue', description: 'Funds have been refunded' },
}

/**
 * Logic-only state machine (Canonical transitions)
 */
export class ActivationStateMachine {
    private static readonly TRANSITIONS: Record<ActivationState, ActivationState[]> = {
        INIT: ['RESERVED'],
        RESERVED: ['ACTIVE', 'FAILED', 'CANCELLED'],
        ACTIVE: ['RECEIVED', 'EXPIRED', 'CANCELLED'],
        RECEIVED: [], // Terminal
        EXPIRED: ['REFUNDED'],
        FAILED: ['REFUNDED'],
        CANCELLED: ['REFUNDED'],
        REFUNDED: [], // Terminal
    }

    private static readonly TERMINAL_STATES: ActivationState[] = ['RECEIVED', 'REFUNDED']
    private static readonly REFUNDABLE_STATES: ActivationState[] = ['EXPIRED', 'FAILED', 'CANCELLED']

    static canTransition(from: ActivationState, to: ActivationState): boolean {
        return this.TRANSITIONS[from]?.includes(to) || false
    }

    static validateTransition(from: ActivationState, to: ActivationState): ActivationState {
        if (!this.canTransition(from, to)) {
            throw new Error(`[ActivationStateMachine] Invalid Transition: ${from} -> ${to}`)
        }
        return to
    }

    static isTerminal(state: ActivationState): boolean {
        return this.TERMINAL_STATES.includes(state)
    }

    static isRefundable(state: ActivationState): boolean {
        return this.REFUNDABLE_STATES.includes(state)
    }

    static getAllowedTransitions(state: ActivationState): ActivationState[] {
        return this.TRANSITIONS[state] || []
    }
}

/**
 * Side-Effect Engine (Persistence + Orchestration)
 */
export class StateEngine {
    /**
     * Atomically transition an activation with side effects (History + Outbox)
     */
    static async transition(activationId: string, newState: ActivationState, metadata?: any): Promise<void> {
        try {
            await prisma.$transaction(async (tx) => {
                const activation = await tx.activation.findUnique({ where: { id: activationId } })
                if (!activation) throw new Error(`Activation ${activationId} not found`)

                const currentState = activation.state as ActivationState

                // 1. Validate Transition
                ActivationStateMachine.validateTransition(currentState, newState)

                // 2. Persist State Change
                await tx.activation.update({
                    where: { id: activationId },
                    data: { state: newState, updatedAt: new Date() }
                })

                // 3. Create Lifecycle History
                await tx.activationStateHistory.create({
                    data: {
                        activationId,
                        state: newState,
                        previousState: currentState,
                        metadata: metadata || {}
                    }
                })

                // 4. Emit Outbox Event (Reliable Delivery)
                await createOutboxEvent(tx, {
                    aggregateId: activationId,
                    aggregateType: 'ACTIVATION',
                    eventType: `activation.${newState.toLowerCase()}`,
                    payload: { activationId, previousState: currentState, metadata }
                })
            })

            logger.info(`[StateEngine] Transitioned ${activationId} to ${newState}`)
        } catch (error: any) {
            logger.error(`[StateEngine] Transition failed for ${activationId}: ${error.message}`)
            throw error
        }
    }
}

// ============================================================================
// Backwards Compatibility Exports
// ============================================================================

export const TERMINAL_STATES = ['RECEIVED', 'REFUNDED']
export const REFUNDABLE_STATES = ['EXPIRED', 'FAILED', 'CANCELLED']

export function canTransition(from: ActivationState, to: ActivationState): boolean {
    return ActivationStateMachine.canTransition(from, to)
}

export function getAllowedTransitions(current: ActivationState): ActivationState[] {
    return ActivationStateMachine.getAllowedTransitions(current)
}

export function isTerminal(state: ActivationState): boolean {
    return ActivationStateMachine.isTerminal(state)
}

export function isRefundable(state: ActivationState): boolean {
    return ActivationStateMachine.isRefundable(state)
}

export function transition(from: ActivationState, to: ActivationState): ActivationState {
    return ActivationStateMachine.validateTransition(from, to)
}
