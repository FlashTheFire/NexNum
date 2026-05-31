/**
 * Activation State Machine — Unit Tests
 *
 * Tests every edge of the transition graph including:
 *  - All valid forward transitions
 *  - All illegal transitions (should throw)
 *  - Terminal state detection
 *  - Refundable state detection
 *  - Bidirectional graph completeness (no orphaned states)
 */

import { describe, it, expect } from 'vitest'
import {
    ActivationStateMachine,
    canTransition,
    isTerminal,
    isRefundable,
    transition,
    getAllowedTransitions,
    STATE_METADATA,
    type ActivationState,
} from '@/lib/activation/activation-state-machine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_STATES: ActivationState[] = [
    'INIT', 'RESERVED', 'ACTIVE', 'RECEIVED',
    'EXPIRED', 'CANCELLED', 'FAILED', 'REFUNDED',
]

/** Enumerate every ordered pair of distinct states */
const allPairs = (): [ActivationState, ActivationState][] =>
    ALL_STATES.flatMap(a => ALL_STATES.filter(b => b !== a).map(b => [a, b] as [ActivationState, ActivationState]))

// ---------------------------------------------------------------------------
// Valid transitions matrix (canonical spec)
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: [ActivationState, ActivationState][] = [
    ['INIT',      'RESERVED'],
    ['RESERVED',  'ACTIVE'],
    ['RESERVED',  'FAILED'],
    ['RESERVED',  'CANCELLED'],
    ['ACTIVE',    'RECEIVED'],
    ['ACTIVE',    'EXPIRED'],
    ['ACTIVE',    'CANCELLED'],
    ['EXPIRED',   'REFUNDED'],
    ['FAILED',    'REFUNDED'],
    ['CANCELLED', 'REFUNDED'],
]

const VALID_SET = new Set(VALID_TRANSITIONS.map(([f, t]) => `${f}->${t}`))

// ---------------------------------------------------------------------------
// State Machine — transition graph
// ---------------------------------------------------------------------------

describe('ActivationStateMachine — transition graph', () => {
    it.each(VALID_TRANSITIONS)('allows %s → %s', (from, to) => {
        expect(canTransition(from, to)).toBe(true)
    })

    it('should produce the expected transition graph (no extra edges)', () => {
        for (const [from, to] of allPairs()) {
            const key = `${from}->${to}`
            const expected = VALID_SET.has(key)
            expect(canTransition(from, to)).toBe(expected)
        }
    })

    it('rejects self-transitions', () => {
        for (const state of ALL_STATES) {
            expect(canTransition(state, state)).toBe(false)
        }
    })

    it('validateTransition throws on invalid edge', () => {
        expect(() => transition('RECEIVED', 'ACTIVE')).toThrow(/Invalid Transition/)
        expect(() => transition('REFUNDED', 'ACTIVE')).toThrow(/Invalid Transition/)
        expect(() => transition('INIT', 'RECEIVED')).toThrow(/Invalid Transition/)
    })

    it('validateTransition returns the target state on valid edge', () => {
        expect(transition('INIT', 'RESERVED')).toBe('RESERVED')
        expect(transition('RESERVED', 'ACTIVE')).toBe('ACTIVE')
        expect(transition('ACTIVE', 'RECEIVED')).toBe('RECEIVED')
    })
})

// ---------------------------------------------------------------------------
// Terminal states
// ---------------------------------------------------------------------------

describe('ActivationStateMachine — terminal states', () => {
    const TERMINAL: ActivationState[] = ['RECEIVED', 'REFUNDED']
    const NON_TERMINAL: ActivationState[] = ALL_STATES.filter(s => !TERMINAL.includes(s))

    it.each(TERMINAL)('%s is terminal', (state) => {
        expect(isTerminal(state)).toBe(true)
    })

    it.each(NON_TERMINAL)('%s is NOT terminal', (state) => {
        expect(isTerminal(state)).toBe(false)
    })

    it('terminal states have no allowed outgoing transitions', () => {
        for (const t of TERMINAL) {
            expect(getAllowedTransitions(t)).toHaveLength(0)
        }
    })
})

// ---------------------------------------------------------------------------
// Refundable states
// ---------------------------------------------------------------------------

describe('ActivationStateMachine — refundable states', () => {
    const REFUNDABLE: ActivationState[] = ['EXPIRED', 'FAILED', 'CANCELLED']
    const NON_REFUNDABLE: ActivationState[] = ALL_STATES.filter(s => !REFUNDABLE.includes(s))

    it.each(REFUNDABLE)('%s is refundable', (state) => {
        expect(isRefundable(state)).toBe(true)
    })

    it.each(NON_REFUNDABLE)('%s is NOT refundable', (state) => {
        expect(isRefundable(state)).toBe(false)
    })

    it('every refundable state can transition to REFUNDED', () => {
        for (const state of REFUNDABLE) {
            expect(canTransition(state, 'REFUNDED')).toBe(true)
        }
    })
})

// ---------------------------------------------------------------------------
// Metadata completeness
// ---------------------------------------------------------------------------

describe('STATE_METADATA', () => {
    it('has an entry for every state', () => {
        for (const state of ALL_STATES) {
            expect(STATE_METADATA).toHaveProperty(state)
            expect(STATE_METADATA[state].label).toBeTruthy()
            expect(STATE_METADATA[state].color).toBeTruthy()
        }
    })
})

// ---------------------------------------------------------------------------
// getAllowedTransitions
// ---------------------------------------------------------------------------

describe('getAllowedTransitions', () => {
    it('returns the correct outgoing edges for RESERVED', () => {
        const allowed = getAllowedTransitions('RESERVED')
        expect(allowed).toContain('ACTIVE')
        expect(allowed).toContain('FAILED')
        expect(allowed).toContain('CANCELLED')
        expect(allowed).not.toContain('RECEIVED')
    })

    it('returns the correct outgoing edges for ACTIVE', () => {
        const allowed = getAllowedTransitions('ACTIVE')
        expect(allowed).toContain('RECEIVED')
        expect(allowed).toContain('EXPIRED')
        expect(allowed).toContain('CANCELLED')
        expect(allowed).not.toContain('RESERVED')
    })
})

// ---------------------------------------------------------------------------
// ActivationStateMachine static class mirrors exported functions
// ---------------------------------------------------------------------------

describe('ActivationStateMachine — static class mirrors', () => {
    it('canTransition matches ActivationStateMachine.canTransition', () => {
        expect(canTransition('ACTIVE', 'RECEIVED'))
            .toBe(ActivationStateMachine.canTransition('ACTIVE', 'RECEIVED'))
    })

    it('isTerminal matches ActivationStateMachine.isTerminal', () => {
        expect(isTerminal('REFUNDED')).toBe(ActivationStateMachine.isTerminal('REFUNDED'))
        expect(isTerminal('ACTIVE')).toBe(ActivationStateMachine.isTerminal('ACTIVE'))
    })

    it('isRefundable matches ActivationStateMachine.isRefundable', () => {
        expect(isRefundable('EXPIRED')).toBe(ActivationStateMachine.isRefundable('EXPIRED'))
        expect(isRefundable('ACTIVE')).toBe(ActivationStateMachine.isRefundable('ACTIVE'))
    })
})
