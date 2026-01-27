/**
 * Activation Module - Professional SMS Order Management
 * 
 * Central export point for all activation/order management functionality.
 */

// ============================================================================
// Main Orchestrator
// ============================================================================

export {
    OrderOrchestrator,
    type PurchaseRequest,
    type PurchaseResult,
    type OrderStatus
} from './order-orchestrator'

// ============================================================================
// Core Services
// ============================================================================

export { WalletService } from '@/lib/wallet/wallet'
export { ActivationService } from './activation-service'
export { lifecycleManager, NumberLifecycleManager } from './number-lifecycle-manager'

// ============================================================================
// Unified Poll Manager (combines adaptive + batch polling)
// ============================================================================

export {
    UnifiedPollManager,
    unifiedPollManager,
    runPollCycle,
    type PollCycleStats
} from './unified-poll-manager'

// Polling exports (re-exported from unified manager)
export { getNextPollDelay, describePollStrategy, type PollContext, type PollDecision, type BatchPollItem, type BatchPollResult } from './unified-poll-manager'
export { BatchPollManager, getActiveNumbersForPolling } from './batch-poll-manager'
export { AdaptivePollStrategy, type PollStrategyPhase } from './adaptive-poll-strategy'
export { PredictiveThrottler } from './predictive-throttler'
export { MultiSmsHandler, type SmsMessage, type MultiSmsState } from '@/lib/sms/multi-sms-handler'

// ============================================================================
// State Machine & Engine (Consolidated)
// ============================================================================

export {
    ActivationStateMachine,
    StateEngine,
    canTransition,
    getAllowedTransitions,
    isTerminal,
    isRefundable,
    transition,
    TERMINAL_STATES,
    REFUNDABLE_STATES,
    STATE_METADATA,
    type ActivationState
} from './activation-state-machine'

// ============================================================================
// Outbox Pattern
// ============================================================================

export {
    createOutboxEvent,
    publishOutboxEvent,
    fetchPendingOutboxEvents,
    markEventsProcessed,
    markEventFailed,
    getOutboxStats,
    processOutboxEvents,
    cleanupProcessedEvents,
    type OutboxPayload
} from './outbox'
