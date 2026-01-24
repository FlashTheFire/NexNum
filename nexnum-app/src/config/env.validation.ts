/**
 * Environment Variable Validation
 * 
 * Uses Zod schema for strict runtime validation.
 * Validates required environment variables on application startup.
 */

import { envSchema, validateProductionRequirements } from './env.schema'

// ============================================
// VALIDATION RESULT
// ============================================
export interface ValidationResult {
    valid: boolean
    errors: string[]
    warnings: string[]
    parsed?: Record<string, unknown>
}

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
// VALIDATION FUNCTION (Zod-based)
// ============================================
export function validateEnv(): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. Parse with Zod schema
    const result = envSchema.safeParse(process.env)

    if (!result.success) {
        // Extract Zod errors
        const zodErrors = result.error.issues.map(issue => {
            const path = issue.path.join('.')
            return `${path}: ${issue.message}`
        })
        errors.push(...zodErrors)
    }

    // 2. Check production requirements
    const missing = validateProductionRequirements()
    if (missing.length > 0) {
        errors.push(...missing.map(m => `Missing required: ${m}`))
    }

    // 3. Check recommended variables
    for (const key of RECOMMENDED_VARS) {
        if (!process.env[key]) {
            warnings.push(`Recommended environment variable not set: ${key}`)
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        parsed: result.success ? result.data : undefined,
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
    } else {
        console.log('✅ Environment validation passed')
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

// ============================================
// TYPED ENV ACCESS
// ============================================
export function getTypedEnv() {
    const result = envSchema.safeParse(process.env)
    if (!result.success) {
        throw new Error('Environment validation failed: ' + JSON.stringify(result.error.issues))
    }
    return result.data
}
