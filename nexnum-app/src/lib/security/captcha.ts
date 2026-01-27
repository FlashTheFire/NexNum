/**
 * Multi-Provider CAPTCHA Adapter
 * 
 * Supports:
 * 1. hCaptcha (Primary - 100k free tier + Privacy)
 * 2. Google reCAPTCHA v2/v3 (Backup - 10k free tier)
 */

import { logger } from '@/lib/core/logger'

const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify'
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET

export interface CaptchaVerifyResult {
    success: boolean
    error?: string
    hostname?: string
    provider: 'hcaptcha' | 'recaptcha' | 'none'
}

/**
 * Universal CAPTCHA Verification Engine
 */
export async function verifyCaptcha(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
    // 1. Determine active provider base on configuration and token prefix
    // Google tokens usually start with a specific pattern or we rely on SECRET configuration

    // We prioritize hCaptcha if configured
    if (HCAPTCHA_SECRET) {
        return verifyHCaptcha(token, remoteIp)
    }

    if (RECAPTCHA_SECRET) {
        return verifyReCaptcha(token, remoteIp)
    }

    // Skip in development if not configured
    if (process.env.NODE_ENV === 'development') {
        console.warn('[Captcha] No provider secret configured, skipping in development')
        return { success: true, provider: 'none' }
    }

    return { success: false, error: 'CAPTCHA not configured', provider: 'none' }
}

/**
 * hCaptcha Specific Verification
 */
async function verifyHCaptcha(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
    if (!token) return { success: false, error: 'CAPTCHA token required', provider: 'hcaptcha' }

    try {
        const params = new URLSearchParams({
            secret: HCAPTCHA_SECRET!,
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
    } catch (error) {
        logger.error('[hCaptcha] Verification error:', error)
        return { success: false, error: 'CAPTCHA service unavailable', provider: 'hcaptcha' }
    }
}

/**
 * Google reCAPTCHA Specific Verification
 */
async function verifyReCaptcha(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
    if (!token) return { success: false, error: 'CAPTCHA token required', provider: 'recaptcha' }

    try {
        const params = new URLSearchParams({
            secret: RECAPTCHA_SECRET!,
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
    } catch (error) {
        logger.error('[reCAPTCHA] Verification error:', error)
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

export function isCaptchaRequired(): boolean {
    return !!HCAPTCHA_SECRET || !!RECAPTCHA_SECRET || process.env.NODE_ENV === 'production'
}

export function getCaptchaSiteKey(): string | null {
    return process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY ||
        process.env.NEXT_PUBLIC_RECAPTCHA_SITEKEY ||
        null
}
