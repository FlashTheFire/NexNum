/**
 * Environment Variable Schema (Zod)
 * 
 * Strict runtime validation for all environment variables.
 * Fails fast in production if required vars are missing.
 */

import { z } from 'zod'

// ============================================
// HELPER SCHEMAS
// ============================================

const urlSchema = z.string().url()
const optionalUrl = z.string().url().optional().or(z.literal(''))
const positiveNumber = z.coerce.number().positive()
const nonNegativeNumber = z.coerce.number().nonnegative()

// ============================================
// ENVIRONMENT SCHEMA
// ============================================

export const envSchema = z.object({
    // ── Node Environment ──────────────────────
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // ── Core Infrastructure ───────────────────
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DIRECT_URL: z.string().optional(),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    MEILISEARCH_HOST: z.string().default('http://localhost:7700'),
    MEILISEARCH_API_KEY: z.string().optional(),

    // ── Authentication ────────────────────────
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    ENCRYPTION_KEY: z.string().optional(),

    // ── App Settings ──────────────────────────
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

    // ── SMS Providers ─────────────────────────
    SMS_PROVIDER: z.string().default('herosms'),

    HERO_SMS_API_URL: z.string().default('https://herosms.one/stubs/handler_api.php'),
    GRIZZLYSMS_API_URL: z.string().default('https://api.grizzlysms.com/stubs/handler_api.php'),
    SMSBOWER_API_URL: z.string().default('https://smsbower.com/api'),
    FIVESIM_API_URL: z.string().default('https://5sim.net/v1'),
    ONLINESIM_API_URL: z.string().default('https://onlinesim.io/api'),

    // ── Limits ────────────────────────────────
    DAILY_SPEND_LIMIT: positiveNumber.default(100),
    MAX_PURCHASE_AMOUNT: positiveNumber.default(50),
    MIN_PURCHASE_AMOUNT: positiveNumber.default(0.01),
    MAX_ACTIVE_NUMBERS: z.coerce.number().int().positive().default(10),
    MAX_SMS_PER_ACTIVATION: z.coerce.number().int().positive().default(5),

    // ── Timeouts (milliseconds) ───────────────
    RESERVATION_TTL_MS: z.coerce.number().int().positive().default(300000),
    MIN_REFUND_AGE_MS: z.coerce.number().int().positive().default(120000),
    STUCK_THRESHOLD_MS: z.coerce.number().int().positive().default(600000),
    PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    NUMBER_LIFETIME_MS: z.coerce.number().int().positive().default(1200000),
    GRACE_PERIOD_MS: z.coerce.number().int().positive().default(60000),

    // ── Workers ───────────────────────────────
    WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
    POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
    RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
    CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(120000),

    // ── Feature Flags ─────────────────────────
    ENABLE_MOCK_PROVIDER: z.string().optional().transform(v => v === 'true'),
    DEBUG: z.string().optional().transform(v => v === 'true'),
    MAINTENANCE_MODE: z.string().optional().transform(v => v === 'true'),
    ENABLE_SMS_FINGERPRINTING: z.string().optional().transform(v => v !== 'false'),  // Default true
    ENABLE_HEALTH_MONITORING: z.string().optional().transform(v => v !== 'false'),   // Default true

    // ── Pricing ───────────────────────────────
    DEFAULT_MARKUP_PERCENT: positiveNumber.default(20),
    MIN_PRICE_USD: positiveNumber.default(0.10),
    MAX_PRICE_USD: positiveNumber.default(50.00),
    PRICE_PRECISION: z.coerce.number().int().min(0).max(4).default(2),

    // ── Security ──────────────────────────────
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    CRON_SECRET: z.string().optional(),
    CSRF_SECRET: z.string().optional(),
    HCAPTCHA_SECRET: z.string().optional(),
    NEXT_PUBLIC_HCAPTCHA_SITEKEY: z.string().optional(),

    // ── Monitoring ────────────────────────────
    SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),

    // ── Email ─────────────────────────────────
    SMTP_PASS: z.string().optional(),

    // ── Web Push ──────────────────────────────
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),

    // ── AI ────────────────────────────────────
    GEMINI_API_KEYS: z.string().optional(),

    // ── Google OAuth ──────────────────────────
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
})

// ============================================
// TYPE EXPORT
// ============================================

export type Env = z.infer<typeof envSchema>

// ============================================
// PRODUCTION REQUIREMENTS
// ============================================

export const productionRequirements = z.object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    MEILISEARCH_HOST: z.string().min(1),
    MEILISEARCH_API_KEY: z.string().min(1),
    ENCRYPTION_KEY: z.string().min(32),
}).partial()

export function validateProductionRequirements(): string[] {
    const missing: string[] = []

    if (!process.env.DATABASE_URL) missing.push('DATABASE_URL')
    if (!process.env.REDIS_URL) missing.push('REDIS_URL')
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) missing.push('JWT_SECRET (min 32 chars)')

    if (process.env.NODE_ENV === 'production') {
        if (!process.env.MEILISEARCH_API_KEY) missing.push('MEILISEARCH_API_KEY')
        if (!process.env.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY')
        if (!process.env.CSRF_SECRET) missing.push('CSRF_SECRET (must be separate from JWT_SECRET)')


    }

    return missing
}
