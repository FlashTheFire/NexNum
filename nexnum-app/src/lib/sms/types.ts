/**
 * Unified SMS Types
 * 
 * Universal types for SMS/OTP handling across all providers
 * Works with DynamicProvider for standardized responses
 */

// ============================================
// CORE SMS TYPES
// ============================================

export interface SmsResult {
    /** Unique internal ID */
    id: string

    /** Internal number ID from our database */
    numberId: string

    /** Provider's activation/order ID */
    activationId: string

    /** SMS sender (e.g., "WhatsApp", "Google") */
    sender: string

    /** Full SMS text content */
    content: string

    /** Extracted OTP code (if found) */
    code?: string

    /** Confidence score for code extraction (0-1) */
    confidence?: number

    /** When the SMS was received by provider */
    receivedAt: Date

    /** Provider ID (e.g., "provider-a", "provider-b") */
    provider: string

    /** Raw provider response for debugging */
    rawPayload?: any
}

/**
 * UI-Specific SMS Message (Mapped from SmsResult)
 * Used by React hooks and components for view rendering.
 */
export interface SMSMessage {
    id: string
    numberId: string
    from: string // Mapped from sender
    text: string // Mapped from content
    code?: string | null
    receivedAt: string // ISO String for UI
    isRead: boolean
}


// ============================================
// ACTIVATION STATUS
// ============================================

export enum ActivationStatus {
    /** Waiting for SMS */
    PENDING = 'PENDING',

    /** SMS received */
    RECEIVED = 'RECEIVED',

    /** Canceled by user or system */
    CANCELED = 'CANCELED',

    /** Successfully completed */
    FINISHED = 'FINISHED',

    /** Expired without receiving SMS */
    EXPIRED = 'EXPIRED',
}

export interface ActivationInfo {
    /** Provider's activation ID */
    activationId: string

    /** Phone number with country code */
    phoneNumber: string

    /** Current status */
    status: ActivationStatus

    /** Country code (e.g., "2" for Kazakhstan) */
    countryCode: string

    /** Service code (e.g., "tg" for Telegram) */
    serviceCode: string

    /** Operator (if available) */
    operator?: string

    /** Cost in provider's currency */
    cost: number

    /** Currency code (ISO 4217) */
    currency?: number

    /** When activation was created */
    createdAt: Date

    /** When activation expires */
    expiresAt: Date

    /** Received SMS messages */
    sms: SmsResult[]

    /** Provider name */
    provider: string

    /** Can request another SMS on same number */
    canGetAnotherSms?: boolean
}

// ============================================
// POLLING CONFIGURATION
// ============================================

export interface PollingConfig {
    /** Initial poll interval in milliseconds (default: 1000) */
    initialInterval: number

    /** Maximum poll interval in milliseconds (default: 8000) */
    maxInterval: number

    /** Interval multiplier for exponential backoff (default: 2) */
    backoffMultiplier: number

    /** Maximum polling duration in milliseconds (default: 15 minutes) */
    maxDuration: number

    /** Maximum concurrent polls per provider */
    maxConcurrent: number

    /** Cache TTL for SMS results in seconds */
    cacheTtl: number
}

export const DEFAULT_POLLING_CONFIG: PollingConfig = {
    initialInterval: 1000,      // 1 second
    maxInterval: 8000,          // 8 seconds
    backoffMultiplier: 2,       // Double each time
    maxDuration: 15 * 60 * 1000, // 15 minutes
    maxConcurrent: 50,          // 50 concurrent polls
    cacheTtl: 30,               // 30 seconds
}

// ============================================
// POLLING JOB
// ============================================

export interface PollingJob {
    /** Unique job ID */
    id: string

    /** Number ID from our database */
    numberId: string

    /** Provider's activation ID */
    activationId: string

    /** Provider name */
    provider: string

    /** User ID (for priority) */
    userId: string

    /** Job priority (higher = first, 0-10) */
    priority: number

    /** When job was created */
    createdAt: Date

    /** Number of poll attempts */
    attempts: number

    /** Current polling interval */
    currentInterval: number

    /** Next poll time */
    nextPollAt: Date

    /** Job status */
    status: 'pending' | 'polling' | 'completed' | 'failed' | 'expired'
}

// ============================================
// CODE EXTRACTION
// ============================================

export interface CodeExtractionResult {
    /** Extracted code */
    code: string

    /** Confidence score (0-1) */
    confidence: number

    /** Extraction method used */
    method: 'regex' | 'service-pattern' | 'keyword'

    /** Pattern that matched */
    pattern?: string

    /** Whether the code appears to belong to a mismatched service */
    isMismatched?: boolean
}

export interface CodePattern {
    /** Pattern name */
    name: string

    /** Regex pattern */
    regex: RegExp

    /** Service this pattern is specific to */
    service?: string

    /** Keywords that must be present */
    keywords?: string[]

    /** Confidence boost if keywords match */
    confidenceBoost?: number
}

// ============================================
// WEBHOOK TYPES
// ============================================

export interface WebhookPayload {
    /** Provider name */
    provider: string

    /** Event type */
    eventType: 'sms.received' | 'activation.status'

    /** Activation ID */
    activationId: string

    /** SMS data (if sms.received) */
    sms?: {
        text: string
        code?: string
        sender?: string
        receivedAt: Date
    }

    /** Status data (if activation.status) */
    status?: ActivationStatus

    /** Raw webhook payload */
    rawPayload: any

    /** Webhook signature */
    signature?: string

    /** Timestamp */
    timestamp: Date
}

export interface WebhookVerificationResult {
    /** Is signature valid */
    valid: boolean

    /** Error message if invalid */
    error?: string

    /** Time drift in seconds (if timestamp check enabled) */
    timeDrift?: number
}

// ============================================
// PROVIDER HEALTH
// ============================================

export interface ProviderHealth {
    /** Provider ID */
    providerId: string

    /** Health status */
    status: 'healthy' | 'degraded' | 'down'

    /** Success rate (last 100 requests) */
    successRate: number

    /** Average latency in milliseconds */
    avgLatency: number

    /** Average SMS delivery time in milliseconds */
    avgDeliveryTime?: number

    /** Average SMS count per activation */
    avgSmsCount?: number

    /** Circuit breaker state */
    circuitState: 'closed' | 'open' | 'half-open'

    /** Last error message */
    lastError?: string

    /** When health was last checked */
    lastCheckedAt: Date

    /** Consecutive failures */
    consecutiveFailures: number
}

// ============================================
// RATE LIMIT
// ============================================

export interface RateLimitConfig {
    /** Requests per minute */
    rpm: number

    /** Maximum concurrent requests */
    concurrent: number

    /** Burst allowance */
    burst?: number
}

export interface RateLimitResult {
    /** Is request allowed */
    allowed: boolean

    /** Remaining requests in window */
    remaining: number

    /** When limit resets (ms) */
    resetAt: number

    /** Retry after (ms, if blocked) */
    retryAfter?: number
}
