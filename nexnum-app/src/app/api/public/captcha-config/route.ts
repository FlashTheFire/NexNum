/**
 * Public Captcha Config API
 * 
 * Returns the captcha configuration for login/signup forms.
 * Only exposes site key and provider type - NOT the secret key.
 */

import { NextResponse } from 'next/server'
import { getCaptchaSettings } from '@/lib/security/captcha'

export const dynamic = 'force-dynamic'

interface CaptchaConfig {
    enabled: boolean
    provider: 'hcaptcha' | 'recaptcha'
    siteKey: string
}

export async function GET() {
    try {
        const settings = await getCaptchaSettings()

        // Return only public information (no secrets!)
        const config: CaptchaConfig = {
            enabled: settings.enabled,
            provider: settings.provider,
            siteKey: (settings.provider === 'recaptcha'
                ? settings.recaptchaSiteKey
                : settings.hcaptchaSiteKey) || ''
        }

        return NextResponse.json(config)
    } catch (error) {
        console.error('[Captcha Config] Error:', error)
        return NextResponse.json({
            enabled: false, // Safer default on error
            provider: 'hcaptcha',
            siteKey: ''
        })
    }
}
