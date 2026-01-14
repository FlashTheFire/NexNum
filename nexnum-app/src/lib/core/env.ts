/**
 * Environment Variable Validation
 * 
 * Production-Grade Configuration Management
 * Validates all required env vars at startup to fail fast
 */

import { z } from 'zod'

const envSchema = z.object({
    // Database
    DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),
    DIRECT_URL: z.string().url().optional(),

    REDIS_URL: z.string().url().optional(),

    // MeiliSearch
    MEILISEARCH_HOST: z.string().url().default('http://localhost:7700'),
    MEILISEARCH_API_KEY: z.string().default('dev_master_key'),

    // JWT
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

    // Sentry
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),

    // Email (Resend)
    RESEND_API_KEY: z.string().optional(),

    // AI (Gemini)
    GEMINI_API_KEY: z.string().optional(),

    // Image Proxy APIs
    FREEIMAGE_API_KEY: z.string().optional(),
    IMGE_API_KEY: z.string().optional(),

    // App
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
})

export type Env = z.infer<typeof envSchema>

let validatedEnv: Env | null = null

/**
 * Validate environment variables
 * Call this early in application startup
 */
export function validateEnv(): Env {
    if (validatedEnv) return validatedEnv

    const result = envSchema.safeParse(process.env)

    if (!result.success) {
        console.error('❌ Invalid environment variables:')
        for (const issue of result.error.issues) {
            console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
        }

        if (process.env.NODE_ENV === 'production') {
            throw new Error('Environment validation failed. Check logs above.')
        } else {
            console.warn('⚠️ Running in development with invalid env (some features may not work)')
        }
    }

    validatedEnv = result.data as Env
    return validatedEnv
}

/**
 * Get validated env (throws if not validated yet)
 */
export function getEnv(): Env {
    if (!validatedEnv) {
        return validateEnv()
    }
    return validatedEnv
}

// Auto-validate on import in production
if (process.env.NODE_ENV === 'production') {
    validateEnv()
}
