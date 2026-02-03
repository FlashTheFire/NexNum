
import { redis } from '../src/lib/core/redis'
import { encrypt } from '../src/lib/security/encryption'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

async function update() {
    console.log('🔄 Updating CAPTCHA settings to Google reCAPTCHA...')

    try {
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const current = stored ? JSON.parse(stored as string) : {
            oauth: {},
            twoFactor: { required: 'optional', backupCodesCount: 10 },
            password: { minLength: 8, requireUppercase: true, requireNumber: true, requireSpecial: false },
            session: { tokenExpiryDays: 7, maxConcurrentSessions: 5 },
            captcha: { enabled: true, provider: 'hcaptcha' },
            email: { verificationRequired: true, verificationExpiryHours: 24 },
            disposableEmail: { enabled: true, blockPublicProviders: false },
            rateLimit: { authAttemptsPerMinute: 5, lockoutDurationMinutes: 15 }
        }

        // Update with provided keys
        current.captcha = {
            ...current.captcha,
            enabled: true,
            provider: 'recaptcha',
            recaptchaSiteKey: '6Lc6vF8sAAAAAF8KsmGrU4C4XA1frWDqWEvXHrrD',
            recaptchaSecret: encrypt('6Lc6vF8sAAAAACZZFokOZCYLcCWxgJlUCBc7gGUc')
        }

        await redis.set(AUTH_SETTINGS_KEY, JSON.stringify(current))
        console.log('✅ Google reCAPTCHA configured successfully.')

        // Verify 
        const verified = await redis.get(AUTH_SETTINGS_KEY)
        console.log('🔍 Current Settings:', JSON.stringify(JSON.parse(verified as string), null, 2))

    } catch (error) {
        console.error('❌ Update Failed:', error)
    } finally {
        process.exit(0)
    }
}

update()
