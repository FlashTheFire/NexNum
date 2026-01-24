/**
 * Environment Variable Validation
 * Validates required environment variables on application startup
 */

// ============================================
// REQUIRED VARIABLES (all environments)
// ============================================
const REQUIRED_VARS = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
] as const

// ============================================
// PRODUCTION-ONLY REQUIRED VARIABLES
// ============================================
const PRODUCTION_REQUIRED = [
    'MEILISEARCH_HOST',
    'MEILISEARCH_API_KEY',
    'NEXT_PUBLIC_SITE_URL',
] as const

// ============================================
// RECOMMENDED VARIABLES (warn if missing)
// ============================================
const RECOMMENDED_VARS = [
    'SENTRY_DSN',
    'RESEND_API_KEY',
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
] as const

// ============================================
// PROVIDER VARIABLES (at least one required for production)
// ============================================
const PROVIDER_VARS = [
    'HERO_SMS_API_KEY',
    'GRIZZLYSMS_API_KEY',
    'SMSBOWER_API_KEY',
    'FIVESIM_API_KEY',
    'ONLINESIM_API_KEY',
] as const

// ============================================
// VALIDATION RESULT
// ============================================
export interface ValidationResult {
    valid: boolean
    errors: string[]
    warnings: string[]
}

// ============================================
// VALIDATION FUNCTION
// ============================================
export function validateEnv(): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const isProduction = process.env.NODE_ENV === 'production'

    // Check required variables
    for (const key of REQUIRED_VARS) {
        if (!process.env[key]) {
            errors.push(`Missing required environment variable: ${key}`)
        }
    }

    // Check production-only variables
    if (isProduction) {
        for (const key of PRODUCTION_REQUIRED) {
            if (!process.env[key]) {
                errors.push(`Missing production-required environment variable: ${key}`)
            }
        }

        // Check that at least one provider is configured
        const hasProvider = PROVIDER_VARS.some(key => !!process.env[key])
        if (!hasProvider) {
            errors.push('No SMS provider configured. At least one provider API key is required.')
        }
    }

    // Check recommended variables
    for (const key of RECOMMENDED_VARS) {
        if (!process.env[key]) {
            warnings.push(`Recommended environment variable not set: ${key}`)
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    }
}

// ============================================
// STARTUP VALIDATION
// ============================================
export function validateEnvOnStartup(): void {
    const result = validateEnv()

    // Log warnings
    for (const warning of result.warnings) {
        console.warn(`⚠️  ${warning}`)
    }

    // Throw on errors in production
    if (!result.valid) {
        const errorMessage = [
            '❌ Environment validation failed:',
            ...result.errors.map(e => `   • ${e}`),
        ].join('\n')

        if (process.env.NODE_ENV === 'production') {
            throw new Error(errorMessage)
        } else {
            console.error(errorMessage)
        }
    }
}

// ============================================
// GET ENV WITH DEFAULT
// ============================================
export function getEnv(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue
}

export function getEnvRequired(key: string): string {
    const value = process.env[key]
    if (!value) {
        throw new Error(`Required environment variable not set: ${key}`)
    }
    return value
}

export function getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key]
    if (!value) return defaultValue
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? defaultValue : parsed
}

export function getEnvBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key]
    if (!value) return defaultValue
    return value === 'true' || value === '1'
}
