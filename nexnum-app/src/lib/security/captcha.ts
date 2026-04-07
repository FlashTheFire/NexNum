/**
 * Multi-Provider CAPTCHA Adapter (Dynamic)
 * 
 * Supports:
 * 1. hCaptcha (Primary - 100k free tier + Privacy)
 * 2. Google reCAPTCHA v2/v3 (Backup - 10k free tier)
 * 
 * Now fetches configuration from admin settings in Redis.
 */

import { logger } from '@/lib/core/logger'
import { redis } from '@/lib/core/redis'

const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify'
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

export interface CaptchaVerifyResult {
    success: boolean
    error?: string
    hostname?: string
    provider: 'hcaptcha' | 'recaptcha' | 'none'
}

interface CaptchaSettings {
    enabled: boolean
    provider: 'hcaptcha' | 'recaptcha'
    hcaptchaSiteKey?: string
    hcaptchaSecret?: string
    recaptchaSiteKey?: string
    recaptchaSecret?: string
}

/**
 * Get captcha settings with strict Environment Variable Priority
 */
export async function getCaptchaSettings(): Promise<CaptchaSettings> {
    // 1. Base from Environment Variables (Single Source of Truth for secrets)
    const envConfig: CaptchaSettings = {
        enabled: !!(process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || process.env.NEXT_PUBLIC_RECAPTCHA_SITEKEY),
        provider: process.env.HCAPTCHA_SECRET ? 'hcaptcha' : 'recaptcha',
        hcaptchaSiteKey: process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY,
        hcaptchaSecret: process.env.HCAPTCHA_SECRET,
        recaptchaSiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITEKEY,
        recaptchaSecret: process.env.RECAPTCHA_SECRET
    }

    try {
        // 2. Fetch runtime overrides from Redis 
        // NOW PRIORITY: Redis Settings > Environment Variables
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : null

        if (settings?.captcha) {
            envConfig.enabled = settings.captcha.enabled ?? envConfig.enabled
            envConfig.provider = settings.captcha.provider ?? envConfig.provider

            // Decrypt keys if present
            const { decrypt } = await import('@/lib/security/encryption')

            if (settings.captcha.hcaptchaSiteKey) envConfig.hcaptchaSiteKey = settings.captcha.hcaptchaSiteKey
            if (settings.captcha.recaptchaSiteKey) envConfig.recaptchaSiteKey = settings.captcha.recaptchaSiteKey

            // Decrypt Secrets
            if (settings.captcha.hcaptchaSecret) {
                envConfig.hcaptchaSecret = decrypt(settings.captcha.hcaptchaSecret)
            }
            if (settings.captcha.recaptchaSecret) {
                envConfig.recaptchaSecret = decrypt(settings.captcha.recaptchaSecret)
            }
        }

        // 2.5 DB OVERRIDE (High Priority)
        // Use raw query to bypass any potential Prisma schema caching/type issues in the Next.js process
        const { prisma } = await import('@/lib/core/db')
        const result = await prisma.$queryRaw`SELECT captcha_enabled FROM system_settings WHERE id = 'default' LIMIT 1` as any[]
        
        const dbEnabled = result?.[0]?.captcha_enabled

        if (dbEnabled === false) {
            envConfig.enabled = false
        }
    } catch (error) {
        // Fallback to env config if DB is unreachable
        logger.error('[SECURITY] Failed to fetch captcha from DB, falling back to env/redis', { error })
    }

    // 3. Absolute Safety Guard: Force disabled if secrets/keys are missing for the selected provider
    if (envConfig.provider === 'hcaptcha') {
        if (!envConfig.hcaptchaSecret || !envConfig.hcaptchaSiteKey) {
            if (envConfig.enabled) logger.warn('hCaptcha enabled but keys missing. Forcing disabled.', { context: 'SECURITY' })
            envConfig.enabled = false
        }
    } else if (envConfig.provider === 'recaptcha') {
        if (!envConfig.recaptchaSecret || !envConfig.recaptchaSiteKey) {
            if (envConfig.enabled) logger.warn('reCAPTCHA enabled but keys missing. Forcing disabled.', { context: 'SECURITY' })
            envConfig.enabled = false
        }
    }

    return envConfig
}

/**
 * Universal CAPTCHA Verification Engine (Dynamic)
 */
export async function verifyCaptcha(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
    const settings = await getCaptchaSettings()

    // If captcha is disabled, skip verification
    if (!settings.enabled) {
        logger.info('Captcha disabled in admin settings, skipping verification', { context: 'SECURITY' })
        return { success: true, provider: 'none' }
    }

    // Empty token when captcha is required = fail
    if (!token && settings.enabled) {
        return { success: false, error: 'CAPTCHA token required', provider: settings.provider }
    }

    // Verify with configured provider
    if (settings.provider === 'hcaptcha' && settings.hcaptchaSecret) {
        return verifyHCaptcha(token, remoteIp, settings.hcaptchaSecret)
    }

    if (settings.provider === 'recaptcha' && settings.recaptchaSecret) {
        return verifyReCaptcha(token, remoteIp, settings.recaptchaSecret)
    }

    // Skip in development if not configured
    if (process.env.NODE_ENV === 'development') {
        logger.warn('No captcha provider secret configured, skipping in development', { context: 'SECURITY' })
        return { success: true, provider: 'none' }
    }

    return { success: false, error: 'CAPTCHA not configured', provider: 'none' }
}

/**
 * hCaptcha Specific Verification
 */
async function verifyHCaptcha(token: string, remoteIp: string | undefined, secret: string): Promise<CaptchaVerifyResult> {
    if (!token) return { success: false, error: 'CAPTCHA token required', provider: 'hcaptcha' }

    try {
        const params = new URLSearchParams({
            secret,
            response: token,
            ...(remoteIp && { remoteip: remoteIp })
        })

        const response = await fetch(HCAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        })

        const data = await response.json()
        if (data.success) return { success: true, hostname: data.hostname, provider: 'hcaptcha' }

        return {
            success: false,
            error: mapErrorCodes(data['error-codes'] || [], 'hcaptcha'),
            provider: 'hcaptcha'
        }
    } catch (error: any) {
        logger.error('hCaptcha verification error', { context: 'SECURITY', error: error.message })
        return { success: false, error: 'CAPTCHA service unavailable', provider: 'hcaptcha' }
    }
}

/**
 * Google reCAPTCHA Specific Verification
 */
async function verifyReCaptcha(token: string, remoteIp: string | undefined, secret: string): Promise<CaptchaVerifyResult> {
    if (!token) return { success: false, error: 'CAPTCHA token required', provider: 'recaptcha' }

    try {
        const params = new URLSearchParams({
            secret,
            response: token,
            ...(remoteIp && { remoteip: remoteIp })
        })

        const response = await fetch(RECAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        })

        const data = await response.json()
        if (data.success) return { success: true, hostname: data.hostname, provider: 'recaptcha' }

        return {
            success: false,
            error: mapErrorCodes(data['error-codes'] || [], 'recaptcha'),
            provider: 'recaptcha'
        }
    } catch (error: any) {
        logger.error('reCAPTCHA verification error', { context: 'SECURITY', error: error.message })
        return { success: false, error: 'CAPTCHA service unavailable', provider: 'recaptcha' }
    }
}

function mapErrorCodes(codes: string[], provider: string): string {
    const errorMap: Record<string, string> = {
        'missing-input-secret': 'Server configuration error',
        'invalid-input-secret': 'Server configuration error',
        'missing-input-response': 'CAPTCHA token required',
        'invalid-input-response': 'Invalid CAPTCHA token',
        'invalid-or-already-seen-response': 'CAPTCHA already used',
    }
    return errorMap[codes[0]] || `CAPTCHA verification failed (${provider})`
}

/**
 * Check if captcha is required (async - fetches from settings)
 */
export async function isCaptchaRequired(): Promise<boolean> {
    const settings = await getCaptchaSettings()
    return settings.enabled
}

/**
 * Get captcha site key (async - fetches from settings)
 */
export async function getCaptchaSiteKey(): Promise<string | null> {
    const settings = await getCaptchaSettings()

    if (settings.provider === 'recaptcha') {
        return settings.recaptchaSiteKey || null
    }

    return settings.hcaptchaSiteKey || null
}
