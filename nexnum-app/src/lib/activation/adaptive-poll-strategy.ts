/**
 * Adaptive Polling Strategy
 * 
 * Professional polling cycle that adapts based on:
 * 1. Order age (time since purchase)
 * 2. Order state (waiting vs has SMS)
 * 3. SMS history (how many received)
 * 
 * Philosophy:
 * - Most SMS arrive within 30 seconds → poll aggressively early
 * - Gradually reduce frequency to save API calls
 * - After SMS received, poll faster for multi-SMS services
 * - Always add jitter to prevent thundering herd
 */

// ============================================================================
// Types
// ============================================================================

export interface PollContext {
    /** Seconds since order was created */
    orderAgeSeconds: number

    /** Number of SMS messages already received */
    smsCount: number

    /** Current poll attempt number (0-based) */
    pollAttempt: number

    /** Whether the circuit breaker is open */
    circuitOpen?: boolean

    /** Last poll had an error */
    lastPollError?: boolean
}

export interface PollDecision {
    /** Seconds until next poll */
    delaySeconds: number

    /** Description for logging */
    phase: string

    /** Whether to use batch polling */
    useBatch: boolean
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Professional Polling Phases
 * 
 * Based on SMS delivery statistics:
 * - 70% of SMS arrive within 30 seconds
 * - 90% arrive within 2 minutes
 * - 98% arrive within 5 minutes
 * - Remaining 2% can take up to 10+ minutes
 */
const POLLING_PHASES = {
    // Phase 1: Initial Rush (0-30s)
    // Most SMS arrive here - poll aggressively
    INITIAL: {
        maxAge: 30,
        cycle: [2, 3, 4, 5],  // 2s, 3s, 4s, 5s then repeat
        phase: 'initial_rush'
    },

    // Phase 2: Early Wait (30s - 2min)
    // Still likely to receive, moderate polling
    EARLY: {
        maxAge: 120,
        cycle: [4, 5, 6, 7],
        phase: 'early_wait'
    },

    // Phase 3: Standard Wait (2min - 5min)
    // Less likely, slow down to save API calls
    STANDARD: {
        maxAge: 300,
        cycle: [6, 8, 10, 8],
        phase: 'standard_wait'
    },

    // Phase 4: Extended Wait (5min - 10min)
    // Rare at this point, poll conservatively
    EXTENDED: {
        maxAge: 600,
        cycle: [10, 12, 15, 12],
        phase: 'extended_wait'
    },

    // Phase 5: Final Window (10min - 15min)
    // Only for SMS-extended orders
    FINAL: {
        maxAge: 900,
        cycle: [12, 15, 18, 15],
        phase: 'final_window'
    },

    // Phase 6: Last Chance (15min - 20min)
    // Very rare, minimal polling
    LAST_CHANCE: {
        maxAge: 1200,
        cycle: [15, 20, 25, 20],
        phase: 'last_chance'
    }
}

/**
 * Post-SMS Polling (after receiving at least one SMS)
 * Faster polling to catch follow-up SMS for multi-code services
 */
const POST_SMS_PHASES = {
    // Just received SMS (0-30s after)
    IMMEDIATE: {
        maxAge: 30,
        cycle: [3, 4, 5, 4],
        phase: 'post_sms_immediate'
    },

    // Short wait (30s - 2min after SMS)
    SHORT: {
        maxAge: 120,
        cycle: [5, 6, 7, 6],
        phase: 'post_sms_short'
    },

    // Standard wait (2min+ after SMS)
    STANDARD: {
        maxAge: 600,
        cycle: [8, 10, 12, 10],
        phase: 'post_sms_standard'
    }
}

// ============================================================================
// Adaptive Polling Logic
// ============================================================================

export class AdaptivePollStrategy {

    /**
     * Calculate the next poll delay based on order context
     */
    static getNextPollDelay(context: PollContext): PollDecision {
        const { orderAgeSeconds, smsCount, pollAttempt, circuitOpen, lastPollError } = context

        // Circuit breaker open - use exponential backoff
        if (circuitOpen) {
            const backoffDelay = Math.min(30, Math.pow(2, Math.min(pollAttempt, 5)))
            return {
                delaySeconds: backoffDelay + this.jitter(2),
                phase: 'circuit_backoff',
                useBatch: false
            }
        }

        // Error backoff
        if (lastPollError) {
            const errorDelay = Math.min(20, 5 + pollAttempt * 2)
            return {
                delaySeconds: errorDelay + this.jitter(2),
                phase: 'error_backoff',
                useBatch: true
            }
        }

        // Post-SMS polling (already have at least one SMS)
        if (smsCount > 0) {
            return this.getPostSmsDelay(context)
        }

        // Standard pre-SMS polling
        return this.getPreSmsDelay(context)
    }

    /**
     * Polling for orders waiting for first SMS
     */
    private static getPreSmsDelay(context: PollContext): PollDecision {
        const { orderAgeSeconds, pollAttempt } = context

        // Find appropriate phase
        let phaseConfig = POLLING_PHASES.INITIAL

        if (orderAgeSeconds > POLLING_PHASES.LAST_CHANCE.maxAge) {
            // Past the last chance window - should have expired
            phaseConfig = POLLING_PHASES.LAST_CHANCE
        } else if (orderAgeSeconds > POLLING_PHASES.FINAL.maxAge) {
            phaseConfig = POLLING_PHASES.LAST_CHANCE
        } else if (orderAgeSeconds > POLLING_PHASES.EXTENDED.maxAge) {
            phaseConfig = POLLING_PHASES.FINAL
        } else if (orderAgeSeconds > POLLING_PHASES.STANDARD.maxAge) {
            phaseConfig = POLLING_PHASES.EXTENDED
        } else if (orderAgeSeconds > POLLING_PHASES.EARLY.maxAge) {
            phaseConfig = POLLING_PHASES.STANDARD
        } else if (orderAgeSeconds > POLLING_PHASES.INITIAL.maxAge) {
            phaseConfig = POLLING_PHASES.EARLY
        }

        const cycleIndex = pollAttempt % phaseConfig.cycle.length
        const baseDelay = phaseConfig.cycle[cycleIndex]

        return {
            delaySeconds: baseDelay + this.jitter(baseDelay * 0.3),
            phase: phaseConfig.phase,
            useBatch: orderAgeSeconds > 60 // Use batch after first minute
        }
    }

    /**
     * Polling for orders that already have SMS (waiting for more)
     */
    private static getPostSmsDelay(context: PollContext): PollDecision {
        const { pollAttempt } = context

        // For post-SMS, use the attempt count to determine phase
        // (since we reset timing after each SMS)
        const secondsSinceLastSms = pollAttempt * 5 // Rough estimate

        let phaseConfig = POST_SMS_PHASES.IMMEDIATE

        if (secondsSinceLastSms > POST_SMS_PHASES.SHORT.maxAge) {
            phaseConfig = POST_SMS_PHASES.STANDARD
        } else if (secondsSinceLastSms > POST_SMS_PHASES.IMMEDIATE.maxAge) {
            phaseConfig = POST_SMS_PHASES.SHORT
        }

        const cycleIndex = pollAttempt % phaseConfig.cycle.length
        const baseDelay = phaseConfig.cycle[cycleIndex]

        return {
            delaySeconds: baseDelay + this.jitter(baseDelay * 0.25),
            phase: phaseConfig.phase,
            useBatch: true
        }
    }

    /**
     * Add random jitter to prevent thundering herd
     * Returns value between 0 and maxJitter
     */
    private static jitter(maxJitter: number): number {
        return Math.random() * maxJitter
    }

    /**
     * Get a human-readable description of the polling strategy
     */
    static describeStrategy(): string {
        return `
Adaptive Polling Strategy:

PRE-SMS (Waiting for first SMS):
┌────────────────┬─────────────────┬──────────────────────┐
│ Order Age      │ Poll Cycle      │ Phase                │
├────────────────┼─────────────────┼──────────────────────┤
│ 0 - 30s        │ [2, 3, 4, 5]s   │ Initial Rush         │
│ 30s - 2min     │ [4, 5, 6, 7]s   │ Early Wait           │
│ 2min - 5min    │ [6, 8, 10, 8]s  │ Standard Wait        │
│ 5min - 10min   │ [10, 12, 15]s   │ Extended Wait        │
│ 10min - 15min  │ [12, 15, 18]s   │ Final Window         │
│ 15min - 20min  │ [15, 20, 25]s   │ Last Chance          │
└────────────────┴─────────────────┴──────────────────────┘

POST-SMS (After receiving SMS, waiting for more):
┌────────────────┬─────────────────┬──────────────────────┐
│ Time Since SMS │ Poll Cycle      │ Phase                │
├────────────────┼─────────────────┼──────────────────────┤
│ 0 - 30s        │ [3, 4, 5, 4]s   │ Post-SMS Immediate   │
│ 30s - 2min     │ [5, 6, 7, 6]s   │ Post-SMS Short       │
│ 2min+          │ [8, 10, 12]s    │ Post-SMS Standard    │
└────────────────┴─────────────────┴──────────────────────┘

All delays include ±30% jitter to prevent thundering herd.
        `.trim()
    }
}

// ============================================================================
// Convenience Exports
// ============================================================================

export function getNextPollDelay(context: PollContext): PollDecision {
    return AdaptivePollStrategy.getNextPollDelay(context)
}

export function describePollStrategy(): string {
    return AdaptivePollStrategy.describeStrategy()
}
