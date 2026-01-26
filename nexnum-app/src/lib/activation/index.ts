/**
 * Activation Module - Professional SMS Order Management
 * 
 * Central export point for all activation/order management functionality.
 * 
 * Usage:
 * ```typescript
 * import { OrderOrchestrator, WalletService, lifecycleManager } from '@/lib/activation'
 * 
 * // Purchase a number
 * const result = await OrderOrchestrator.purchase({
 *     userId: 'user-123',
 *     providerId: 'provider-456',
 *     countryCode: 'us',
 *     serviceCode: 'wa',
 *     price: 0.50
 * })
 * 
 * // Get order status
 * const status = await OrderOrchestrator.getOrderStatus(result.orderId, 'user-123')
 * ```
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
export { AdaptivePollStrategy } from './adaptive-poll-strategy'
export { MultiSmsHandler, type SmsMessage, type MultiSmsState } from '@/lib/sms/multi-sms-handler'

// ============================================================================
// State Machine
// ============================================================================

export {
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
