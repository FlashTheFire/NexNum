/**
 * hCaptcha Integration
 * 
 * To enable, add to your .env:
 * HCAPTCHA_SECRET=your_hcaptcha_secret_key
 * NEXT_PUBLIC_HCAPTCHA_SITEKEY=your_hcaptcha_site_key
 */

const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify'
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET

export interface CaptchaVerifyResult {
    success: boolean
    error?: string
    hostname?: string
}

/**
 * Verify hCaptcha token on server-side
 */
export async function verifyCaptcha(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
    // Skip in development if not configured
    if (!HCAPTCHA_SECRET) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[hCaptcha] Secret not configured, skipping verification in development')
            return { success: true }
        }
        return { success: false, error: 'CAPTCHA not configured' }
    }

    if (!token) {
        return { success: false, error: 'CAPTCHA token required' }
    }

    try {
        const params = new URLSearchParams({
            secret: HCAPTCHA_SECRET,
            response: token,
            ...(remoteIp && { remoteip: remoteIp })
        })

        const response = await fetch(HCAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        })

        const data = await response.json()

        if (data.success) {
            return {
                success: true,
                hostname: data.hostname
            }
        }

        // Handle error codes
        const errorCodes = data['error-codes'] || []
        const errorMap: Record<string, string> = {
            'missing-input-secret': 'Server configuration error',
            'invalid-input-secret': 'Server configuration error',
            'missing-input-response': 'CAPTCHA token required',
            'invalid-input-response': 'Invalid CAPTCHA token',
            'bad-request': 'Invalid request',
            'invalid-or-already-seen-response': 'CAPTCHA already used',
            'not-using-dummy-passcode': 'Test error',
            'sitekey-secret-mismatch': 'Configuration mismatch'
        }

        const errorMessage = errorCodes.length > 0
            ? errorMap[errorCodes[0]] || 'CAPTCHA verification failed'
            : 'CAPTCHA verification failed'

        return { success: false, error: errorMessage }

    } catch (error) {
        console.error('[hCaptcha] Verification error:', error)
        return { success: false, error: 'CAPTCHA service unavailable' }
    }
}

/**
 * Check if CAPTCHA is required based on configuration
 */
export function isCaptchaRequired(): boolean {
    return !!HCAPTCHA_SECRET || process.env.NODE_ENV === 'production'
}

/**
 * Get public site key for frontend
 */
export function getCaptchaSiteKey(): string | null {
    return process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || null
}
