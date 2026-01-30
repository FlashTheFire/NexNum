/**
 * Adaptive Polling Strategy (Industrial Edition)
 * 
 * Professional polling cycle that adapts based on:
 * 1. Order age (time since purchase)
 * 2. Order state (waiting vs has SMS)
 * 3. SMS history (how many received)
 */

// ============================================================================
// Types
// ============================================================================

export interface PollStrategyPhase {
    minPollCount: number
    maxPollCount: number | null
    intervalSeconds: number
    name: string
}

export interface PollContext {
    orderAgeSeconds: number
    smsCount: number
    pollAttempt: number
    circuitOpen?: boolean
    lastPollError?: boolean
}

export interface PollDecision {
    delaySeconds: number
    phase: string
    useBatch: boolean
}

interface PhaseConfig {
    maxAge: number
    cycle: number[]
    phase: string
}

// ============================================================================
// Configuration (Declarative)
// ============================================================================

const PRE_SMS_PHASES: PhaseConfig[] = [
    { maxAge: 30, cycle: [2, 3, 4, 5], phase: 'initial_rush' },
    { maxAge: 120, cycle: [4, 5, 6, 7], phase: 'early_wait' },
    { maxAge: 300, cycle: [6, 8, 10, 8], phase: 'standard_wait' },
    { maxAge: 600, cycle: [10, 12, 15, 12], phase: 'extended_wait' },
    { maxAge: 900, cycle: [12, 15, 18, 15], phase: 'final_window' },
    { maxAge: 1200, cycle: [15, 20, 25, 20], phase: 'last_chance' }
]

const POST_SMS_PHASES: PhaseConfig[] = [
    { maxAge: 30, cycle: [3, 4, 5, 4], phase: 'post_sms_immediate' },
    { maxAge: 120, cycle: [5, 6, 7, 6], phase: 'post_sms_short' },
    { maxAge: 600, cycle: [8, 10, 12, 10], phase: 'post_sms_standard' }
]

// ============================================================================
// Adaptive Polling Logic
// ============================================================================

export class AdaptivePollStrategy {
    private static readonly MONITOR_PHASES: PollStrategyPhase[] = [
        { name: 'initial', minPollCount: 0, maxPollCount: 5, intervalSeconds: 5 },
        { name: 'early', minPollCount: 6, maxPollCount: 20, intervalSeconds: 10 },
        { name: 'standard', minPollCount: 21, maxPollCount: 50, intervalSeconds: 30 },
        { name: 'extended', minPollCount: 51, maxPollCount: 100, intervalSeconds: 60 },
        { name: 'long_tail', minPollCount: 101, maxPollCount: null, intervalSeconds: 120 }
    ]

    static getNextInterval(pollCount: number): number {
        const phase = this.MONITOR_PHASES.find(p =>
            pollCount >= p.minPollCount && (p.maxPollCount === null || pollCount <= p.maxPollCount)
        )
        return phase ? phase.intervalSeconds : 60
    }

    static getNextPollTime(currentPollCount: number): Date {
        const interval = this.getNextInterval(currentPollCount)
        return new Date(Date.now() + interval * 1000)
    }

    static getPhaseInfo(pollCount: number): PollStrategyPhase | null {
        return this.MONITOR_PHASES.find(p =>
            pollCount >= p.minPollCount && (p.maxPollCount === null || pollCount <= p.maxPollCount)
        ) || null
    }

    static getNextPollDelay(context: PollContext): PollDecision {
        const { orderAgeSeconds, smsCount, pollAttempt, circuitOpen, lastPollError } = context

        if (circuitOpen) {
            const backoffDelay = Math.min(30, Math.pow(2, Math.min(pollAttempt, 5)))
            return {
                delaySeconds: backoffDelay + this.jitter(2),
                phase: 'circuit_backoff',
                useBatch: false
            }
        }

        if (lastPollError) {
            const errorDelay = Math.min(20, 5 + pollAttempt * 2)
            return {
                delaySeconds: errorDelay + this.jitter(2),
                phase: 'error_backoff',
                useBatch: true
            }
        }

        const strategy = smsCount > 0 ? POST_SMS_PHASES : PRE_SMS_PHASES
        const ageReference = smsCount > 0 ? (pollAttempt * 5) : orderAgeSeconds

        const phaseConfig = strategy.find(p => ageReference <= p.maxAge) || strategy[strategy.length - 1]
        const cycleIndex = pollAttempt % phaseConfig.cycle.length
        const baseDelay = phaseConfig.cycle[cycleIndex]

        return {
            delaySeconds: baseDelay + this.jitter(baseDelay * 0.3),
            phase: phaseConfig.phase,
            useBatch: orderAgeSeconds > 60 || !!lastPollError
        }
    }

    private static jitter(max: number): number {
        return Math.random() * max
    }

    static shouldContinue(pollCount: number, createdAt: Date): boolean {
        const ageMinutes = (Date.now() - createdAt.getTime()) / 60000
        return pollCount < 200 && ageMinutes < 20
    }

    static describeStrategy(): string {
        return "Industrial Adaptive Polling Strategy"
    }
}

// ============================================================================
// Convenience Exports
// ============================================================================

export function getNextPollDelay(context: PollContext): PollDecision {
    return AdaptivePollStrategy.getNextPollDelay(context)
}

export function shouldContinue(pollCount: number, createdAt: Date): boolean {
    return AdaptivePollStrategy.shouldContinue(pollCount, createdAt)
}

export function describePollStrategy(): string {
    return AdaptivePollStrategy.describeStrategy()
}
