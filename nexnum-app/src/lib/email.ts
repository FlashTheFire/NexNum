import { Resend } from 'resend'
import { render } from '@react-email/render'
import { ReactElement } from 'react'
import { SettingsService } from './settings'
import { redis } from '@/lib/core/redis'

// ============================================================
// API KEY POOL MANAGER
// Supports multiple Resend API keys with automatic rotation
// when rate limits (429) or validation errors occur.
// ============================================================

const KEY_POOL_PREFIX = 'email:key:' // Redis key prefix
const COOLDOWN_TTL = 60 * 60        // 1 hour cooldown for exhausted keys

interface KeyStatus {
    key: string
    failures: number
    exhaustedAt: number | null
}

class ApiKeyPool {
    private keys: string[] = []

    constructor() {
        // Load keys from env (comma-separated)
        const envKeys = process.env.RESEND_API_KEYS || process.env.RESEND_API_KEY || ''
        this.keys = envKeys.split(',').map(k => k.trim()).filter(Boolean)

        if (this.keys.length === 0) {
            console.warn('[EmailService] No Resend API keys configured. Emails will be mocked.')
        } else {
            console.log(`[EmailService] Loaded ${this.keys.length} API key(s)`)
        }
    }

    /**
     * Get the next available (non-exhausted) API key
     */
    async getAvailableKey(): Promise<string | null> {
        for (const key of this.keys) {
            const status = await this.getKeyStatus(key)
            // Skip if exhausted and still in cooldown
            if (status.exhaustedAt) {
                const elapsed = Date.now() - status.exhaustedAt
                if (elapsed < COOLDOWN_TTL * 1000) {
                    continue // Still cooling down
                }
                // Cooldown expired, reset status
                await this.resetKey(key)
            }
            return key
        }
        return null // All keys exhausted
    }

    /**
     * Mark a key as exhausted (rate limited)
     */
    async markExhausted(key: string): Promise<void> {
        const redisKey = `${KEY_POOL_PREFIX}${this.hashKey(key)}`
        await redis.set(redisKey, JSON.stringify({
            failures: 0,
            exhaustedAt: Date.now()
        }), 'EX', COOLDOWN_TTL)
        console.warn(`[EmailService] Key ${this.maskKey(key)} marked as exhausted`)
    }

    /**
     * Record a failure for a key (incremental backoff)
     */
    async recordFailure(key: string): Promise<void> {
        const status = await this.getKeyStatus(key)
        status.failures += 1

        // After 3 failures, mark as exhausted
        if (status.failures >= 3) {
            await this.markExhausted(key)
        } else {
            const redisKey = `${KEY_POOL_PREFIX}${this.hashKey(key)}`
            await redis.set(redisKey, JSON.stringify(status), 'EX', 300) // 5 min TTL
        }
    }

    /**
     * Reset a key's status (after cooldown)
     */
    async resetKey(key: string): Promise<void> {
        const redisKey = `${KEY_POOL_PREFIX}${this.hashKey(key)}`
        await redis.del(redisKey)
    }

    private async getKeyStatus(key: string): Promise<KeyStatus> {
        const redisKey = `${KEY_POOL_PREFIX}${this.hashKey(key)}`
        const data = await redis.get(redisKey)
        if (data && typeof data === 'string') {
            return { key, ...JSON.parse(data) }
        }
        return { key, failures: 0, exhaustedAt: null }
    }

    // Simple hash for Redis key (don't store full API key in Redis)
    private hashKey(key: string): string {
        return key.substring(0, 8) + key.substring(key.length - 4)
    }

    // Mask key for logging
    private maskKey(key: string): string {
        return key.substring(0, 6) + '****' + key.substring(key.length - 4)
    }

    get totalKeys(): number {
        return this.keys.length
    }
}

// Global singleton
const keyPool = new ApiKeyPool()

// ============================================================
// EMAIL SERVICE
// ============================================================

interface SendEmailParams {
    to: string
    subject: string
    component: ReactElement
}

export class EmailService {
    /**
     * Send an email using Resend with automatic key rotation
     */
    static async send({ to, subject, component }: SendEmailParams) {
        try {
            // 1. Get settings for sender address
            const settings = await SettingsService.getSettings()
            const from = settings.general.emailSender || 'onboarding@resend.dev'

            // 2. Render React component to HTML
            const html = await render(component)

            // 3. Mock sending if no keys configured (DEV ONLY)
            if (keyPool.totalKeys === 0) {
                if (process.env.NODE_ENV === 'production') {
                    console.error('[EmailService] CRITICAL: No Resend API keys in production!')
                    return { success: false, error: 'Email service not configured' }
                }

                console.log('📧 [Email Mock - DEV ONLY] -----------------------')
                console.log(`From: ${from}`)
                console.log(`To: ${to}`)
                console.log(`Subject: ${subject}`)
                console.log('--- HTML Preview (truncated) ---')
                console.log(html.substring(0, 500) + '...')
                console.log('------------------------------------------------')
                return { success: true, id: 'mock-dev-only' }
            }

            // 4. Attempt to send with key rotation
            let attempts = 0
            const maxAttempts = keyPool.totalKeys

            while (attempts < maxAttempts) {
                const apiKey = await keyPool.getAvailableKey()

                if (!apiKey) {
                    console.error('[EmailService] All API keys exhausted')
                    return { success: false, error: 'All API keys are rate-limited. Try again later.' }
                }

                const resend = new Resend(apiKey)

                try {
                    const data = await resend.emails.send({
                        from,
                        to,
                        subject,
                        html,
                    })

                    if (data.error) {
                        const err = data.error as any
                        // Check for rate limit (429) or validation errors
                        if (err.statusCode === 429 || err.name === 'rate_limit_exceeded') {
                            console.warn(`[EmailService] Rate limit on key. Rotating...`)
                            await keyPool.markExhausted(apiKey)
                            attempts++
                            continue
                        }
                        // Other errors (like domain validation) - record failure but don't immediately rotate
                        await keyPool.recordFailure(apiKey)
                        console.error('Email sending failed:', data.error)
                        return { success: false, error: data.error }
                    }

                    // Success!
                    return { success: true, id: data.data?.id }

                } catch (sendError: any) {
                    // Network or other errors
                    await keyPool.recordFailure(apiKey)
                    console.error('Email send exception:', sendError.message)
                    attempts++
                }
            }

            return { success: false, error: 'Failed to send email after all retries' }

        } catch (error) {
            console.error('Email service error:', error)
            return { success: false, error }
        }
    }
}
