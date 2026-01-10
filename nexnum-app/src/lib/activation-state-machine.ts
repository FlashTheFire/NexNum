/**
 * Activation State Machine
 * 
 * Defines the canonical state transitions for number activations.
 * This ensures consistent state management across the purchase lifecycle.
 * 
 * States:
 * - INIT: Initial state before any action
 * - RESERVED: Funds reserved, awaiting provider confirmation
 * - ACTIVE: Provider confirmed, number is active
 * - RECEIVED: SMS received successfully
 * - EXPIRED: Number expired (with or without SMS)
 * - CANCELLED: User or system cancelled
 * - FAILED: Provider or system failure
 * - REFUNDED: Compensation transaction completed
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
 * State Transition Map
 * 
 * Key: Current State
 * Value: Array of allowed next states
 */
const TRANSITIONS: Record<ActivationState, ActivationState[]> = {
    INIT: ['RESERVED'],
    RESERVED: ['ACTIVE', 'FAILED', 'CANCELLED'],
    ACTIVE: ['RECEIVED', 'EXPIRED', 'CANCELLED'],
    RECEIVED: [], // Terminal state
    EXPIRED: ['REFUNDED'],
    FAILED: ['REFUNDED'],
    CANCELLED: ['REFUNDED'],
    REFUNDED: [], // Terminal state
}

/**
 * Terminal states that cannot transition further
 */
export const TERMINAL_STATES: ActivationState[] = ['RECEIVED', 'REFUNDED']

/**
 * States that qualify for automatic refund
 */
export const REFUNDABLE_STATES: ActivationState[] = ['EXPIRED', 'FAILED', 'CANCELLED']

/**
 * Validate if a state transition is allowed
 */
export function canTransition(from: ActivationState, to: ActivationState): boolean {
    return TRANSITIONS[from].includes(to)
}

/**
 * Get allowed next states from current state
 */
export function getAllowedTransitions(current: ActivationState): ActivationState[] {
    return TRANSITIONS[current]
}

/**
 * Check if state is terminal (no further transitions)
 */
export function isTerminal(state: ActivationState): boolean {
    return TERMINAL_STATES.includes(state)
}

/**
 * Check if state qualifies for refund
 */
export function isRefundable(state: ActivationState): boolean {
    return REFUNDABLE_STATES.includes(state)
}

/**
 * Attempt state transition with validation
 * @throws Error if transition is not allowed
 */
export function transition(from: ActivationState, to: ActivationState): ActivationState {
    if (!canTransition(from, to)) {
        throw new Error(
            `Invalid state transition: ${from} -> ${to}. ` +
            `Allowed transitions from ${from}: [${TRANSITIONS[from].join(', ')}]`
        )
    }
    return to
}

/**
 * State metadata for UI/logging
 */
export const STATE_METADATA: Record<ActivationState, { label: string; color: string; description: string }> = {
    INIT: {
        label: 'Initializing',
        color: 'gray',
        description: 'Activation request received'
    },
    RESERVED: {
        label: 'Pending',
        color: 'yellow',
        description: 'Funds reserved, awaiting provider'
    },
    ACTIVE: {
        label: 'Active',
        color: 'emerald',
        description: 'Number is active and waiting for SMS'
    },
    RECEIVED: {
        label: 'Completed',
        color: 'emerald',
        description: 'SMS received successfully'
    },
    EXPIRED: {
        label: 'Expired',
        color: 'orange',
        description: 'Number has expired'
    },
    CANCELLED: {
        label: 'Cancelled',
        color: 'red',
        description: 'Activation was cancelled'
    },
    FAILED: {
        label: 'Failed',
        color: 'red',
        description: 'Activation failed'
    },
    REFUNDED: {
        label: 'Refunded',
        color: 'blue',
        description: 'Funds have been refunded'
    },
}
