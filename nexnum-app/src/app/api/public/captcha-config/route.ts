/**
 * Public Captcha Config API
 * 
 * Returns the captcha configuration for login/signup forms.
 * Only exposes site key and provider type - NOT the secret key.
 */

import { NextResponse } from 'next/server'
import { redis } from '@/lib/core/redis'

export const dynamic = 'force-dynamic'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

interface CaptchaConfig {
    enabled: boolean
    provider: 'hcaptcha' | 'recaptcha'
    siteKey: string
}

export async function GET() {
    try {
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : null

        const captchaSettings = settings?.captcha || {
            enabled: true,
            provider: 'hcaptcha'
        }

        // Return only public information (no secrets!)
        const config: CaptchaConfig = {
            enabled: captchaSettings.enabled ?? true,
            provider: captchaSettings.provider ?? 'hcaptcha',
            siteKey: captchaSettings.provider === 'recaptcha'
                ? (captchaSettings.recaptchaSiteKey || process.env.NEXT_PUBLIC_RECAPTCHA_SITEKEY || '')
                : (captchaSettings.hcaptchaSiteKey || process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || '')
        }

        return NextResponse.json(config)
    } catch (error) {
        console.error('[Captcha Config] Error:', error)
        // Default fallback
        return NextResponse.json({
            enabled: true,
            provider: 'hcaptcha',
            siteKey: process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || '10000000-ffff-ffff-ffff-000000000001'
        })
    }
}
