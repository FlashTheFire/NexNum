/**
 * Central Application Configuration
 * All values sourced from environment variables with sensible defaults
 */

// ============================================
// LIMITS CONFIGURATION
// ============================================
export const LimitsConfig = {
    /** Maximum daily spend per user in USD */
    dailySpend: parseFloat(process.env.DAILY_SPEND_LIMIT || '1000'),

    /** Maximum single purchase amount in USD */
    maxPurchase: parseFloat(process.env.MAX_PURCHASE_AMOUNT || '50'),

    /** Minimum purchase amount in USD */
    minPurchase: parseFloat(process.env.MIN_PURCHASE_AMOUNT || '0.01'),

    /** Maximum concurrent active numbers per user */
    maxActiveNumbers: parseInt(process.env.MAX_ACTIVE_NUMBERS || '10', 10),

    /** Maximum SMS messages per activation */
    maxSmsPerActivation: parseInt(process.env.MAX_SMS_PER_ACTIVATION || '5', 10),
} as const

// ============================================
// TIMEOUTS CONFIGURATION (all in milliseconds)
// ============================================
export const TimeoutsConfig = {
    /** How long a reservation is held before expiry */
    reservationTtl: parseInt(process.env.RESERVATION_TTL_MS || '300000', 10), // 5 min

    /** Minimum age before an activation can be refunded */
    minRefundAge: parseInt(process.env.MIN_REFUND_AGE_MS || '120000', 10), // 2 min

    /** Threshold for considering an activation stuck */
    stuckThreshold: parseInt(process.env.STUCK_THRESHOLD_MS || '600000', 10), // 10 min

    /** Provider API request timeout */
    providerTimeout: parseInt(process.env.PROVIDER_TIMEOUT_MS || '15000', 10), // 15 sec

    /** Default number lifetime (20 minutes) */
    numberLifetime: parseInt(process.env.NUMBER_LIFETIME_MS || '1200000', 10), // 20 min

    /** Grace period after expiry before hard cleanup */
    gracePeriod: parseInt(process.env.GRACE_PERIOD_MS || '60000', 10), // 1 min
} as const

// ============================================
// WORKERS CONFIGURATION
// ============================================
export const WorkersConfig = {
    /** Number of items to process per batch */
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '50', 10),

    /** Maximum concurrent operations */
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '10', 10),

    /** Polling interval for workers */
    pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10), // 30 sec

    /** Reconcile worker interval */
    reconcileInterval: parseInt(process.env.RECONCILE_INTERVAL_MS || '60000', 10), // 1 min

    /** Cleanup worker interval */
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL_MS || '120000', 10), // 2 min
} as const

// ============================================
// FEATURE FLAGS
// ============================================
export const FeaturesConfig = {


    /** Enable debug logging */
    debugMode: process.env.DEBUG === 'true',

    /** Enable maintenance mode (blocks new purchases) */
    maintenanceMode: process.env.MAINTENANCE_MODE === 'true',

    /** Enable SMS fingerprinting/deduplication */
    smsFingerprinting: process.env.ENABLE_SMS_FINGERPRINTING !== 'false',

    /** Enable provider health monitoring */
    healthMonitoring: process.env.ENABLE_HEALTH_MONITORING !== 'false',
} as const

// ============================================
// PRICING CONFIGURATION
// ============================================
export const PricingConfig = {
    /** Default markup percentage */
    defaultMarkup: parseFloat(process.env.DEFAULT_MARKUP_PERCENT || '20'),

    /** Minimum price in USD */
    minPrice: parseFloat(process.env.MIN_PRICE_USD || '0.10'),

    /** Maximum price in USD */
    maxPrice: parseFloat(process.env.MAX_PRICE_USD || '50.00'),

    /** Currency precision (decimal places) */
    precision: parseInt(process.env.PRICE_PRECISION || '2', 10),
} as const

// ============================================
// SECURITY CONFIGURATION
// ============================================
export const SecurityConfig = {
    /** Rate limit window in milliseconds */
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),

    /** Max requests per window */
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

    /** JWT expiration */
    jwtExpiry: process.env.JWT_EXPIRES_IN || '15m',

    /** Refresh token expiration */
    refreshExpiry: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
} as const

// ============================================
// COMBINED APP CONFIG (for convenience)
// ============================================
export const AppConfig = {
    limits: LimitsConfig,
    timeouts: TimeoutsConfig,
    workers: WorkersConfig,
    features: FeaturesConfig,
    pricing: PricingConfig,
    security: SecurityConfig,
} as const

export type AppConfigType = typeof AppConfig
