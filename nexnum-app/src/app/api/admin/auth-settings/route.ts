/**
 * Admin Authentication Settings API
 * 
 * GET - Retrieve current auth settings
 * PUT - Update auth settings (admin only)
 * 
 * Settings are stored in Redis and cached for performance.
 * Supports 6 OAuth providers: Google, GitHub, Twitter, Discord, Facebook, Telegram
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { redis } from '@/lib/core/redis'
import { getCurrentUser } from '@/lib/auth/jwt'
import { z } from 'zod'
import { ResponseFactory } from '@/lib/api/response-factory'
import { logger } from '@/lib/core/logger'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

// OAuth Provider Schema (reusable)
const oauthProviderSchema = z.object({
    enabled: z.boolean(),
    clientId: z.string(),
    clientSecret: z.string().optional()
})

const telegramProviderSchema = z.object({
    enabled: z.boolean(),
    botUsername: z.string(),
    botToken: z.string().optional()
})

// Default settings with all 6 providers
const defaultSettings = {
    oauth: {
        google: {
            enabled: true,
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
        },
        github: {
            enabled: false,
            clientId: process.env.GITHUB_CLIENT_ID || '',
            clientSecret: process.env.GITHUB_CLIENT_SECRET || ''
        },
        twitter: {
            enabled: false,
            clientId: process.env.TWITTER_CLIENT_ID || '',
            clientSecret: process.env.TWITTER_CLIENT_SECRET || ''
        },
        discord: {
            enabled: false,
            clientId: process.env.DISCORD_CLIENT_ID || '',
            clientSecret: process.env.DISCORD_CLIENT_SECRET || ''
        },
        facebook: {
            enabled: false,
            clientId: process.env.FACEBOOK_CLIENT_ID || '',
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET || ''
        },
        telegram: {
            enabled: false,
            botUsername: process.env.TELEGRAM_BOT_USERNAME || '',
            botToken: process.env.TELEGRAM_BOT_TOKEN || ''
        }
    },
    twoFactor: {
        required: 'optional' as const,
        backupCodesCount: 10
    },
    password: {
        minLength: 8,
        requireUppercase: true,
        requireNumber: true,
        requireSpecial: false
    },
    session: {
        tokenExpiryDays: 7,
        maxConcurrentSessions: 5
    },
    captcha: {
        enabled: true,
        provider: 'hcaptcha' as const,
        hcaptchaSiteKey: process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || '',
        hcaptchaSecret: process.env.HCAPTCHA_SECRET || '',
        recaptchaSiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITEKEY || '',
        recaptchaSecret: process.env.RECAPTCHA_SECRET || ''
    },
    email: {
        verificationRequired: true,
        verificationExpiryHours: 24
    },
    disposableEmail: {
        enabled: true,
        blockPublicProviders: false
    },
    rateLimit: {
        authAttemptsPerMinute: 5,
        lockoutDurationMinutes: 15
    }
}

// Validation schema for updates
const settingsSchema = z.object({
    oauth: z.object({
        google: oauthProviderSchema.optional(),
        github: oauthProviderSchema.optional(),
        twitter: oauthProviderSchema.optional(),
        discord: oauthProviderSchema.optional(),
        facebook: oauthProviderSchema.optional(),
        telegram: telegramProviderSchema.optional()
    }).optional(),
    twoFactor: z.object({
        required: z.enum(['all', 'admin', 'optional']),
        backupCodesCount: z.number().min(5).max(20)
    }).optional(),
    password: z.object({
        minLength: z.number().min(6).max(32),
        requireUppercase: z.boolean(),
        requireNumber: z.boolean(),
        requireSpecial: z.boolean()
    }).optional(),
    session: z.object({
        tokenExpiryDays: z.number().min(1).max(30),
        maxConcurrentSessions: z.number().min(1).max(10)
    }).optional(),
    captcha: z.object({
        enabled: z.boolean(),
        provider: z.enum(['hcaptcha', 'recaptcha']),
        hcaptchaSiteKey: z.string().optional(),
        hcaptchaSecret: z.string().optional(),
        recaptchaSiteKey: z.string().optional(),
        recaptchaSecret: z.string().optional()
    }).optional(),
    email: z.object({
        verificationRequired: z.boolean(),
        verificationExpiryHours: z.number().min(1).max(72)
    }).optional(),
    disposableEmail: z.object({
        enabled: z.boolean(),
        blockPublicProviders: z.boolean()
    }).optional(),
    rateLimit: z.object({
        authAttemptsPerMinute: z.number().min(3).max(20),
        lockoutDurationMinutes: z.number().min(5).max(60)
    }).optional()
})

// Deep merge helper for nested OAuth objects
function deepMergeOAuth(current: any, updates: any): any {
    const result = { ...current }
    for (const provider of ['google', 'github', 'twitter', 'discord', 'facebook', 'telegram']) {
        if (updates?.[provider]) {
            result[provider] = { ...current?.[provider], ...updates[provider] }
        }
    }
    return result
}

// GET - Retrieve settings
export const GET = apiHandler(async (req) => {
    const user = await getCurrentUser(req.headers)

    if (!user || user.role !== 'ADMIN') {
        return ResponseFactory.error('Unauthorized', 403, 'FORBIDDEN')
    }

    try {
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : defaultSettings

        // Merge with defaults and ENFORCE ENV PRIORITY for secrets
        const merged = {
            oauth: deepMergeOAuth(defaultSettings.oauth, settings.oauth),
            twoFactor: { ...defaultSettings.twoFactor, ...settings.twoFactor },
            password: { ...defaultSettings.password, ...settings.password },
            session: { ...defaultSettings.session, ...settings.session },
            captcha: { ...defaultSettings.captcha, ...settings.captcha },
            email: { ...defaultSettings.email, ...settings.email },
            disposableEmail: { ...defaultSettings.disposableEmail, ...settings.disposableEmail },
            rateLimit: { ...defaultSettings.rateLimit, ...settings.rateLimit }
        }

        // REDACT/STANDARDIZE secrets to indicate they are managed by ENV
        // This confirms to the admin that ENV is active
        const redact = (val: string) => val ? '••••••••' : ''

        const response = {
            ...merged,
            oauth: Object.fromEntries(
                Object.entries(merged.oauth).map(([key, provider]: [string, any]) => [
                    key,
                    {
                        ...provider,
                        clientSecret: redact(provider.clientSecret),
                        botToken: redact(provider.botToken)
                    }
                ])
            ),
            captcha: {
                ...merged.captcha,
                hcaptchaSecret: redact(merged.captcha.hcaptchaSecret),
                recaptchaSecret: redact(merged.captcha.recaptchaSecret)
            }
        }

        return ResponseFactory.success(response)
    } catch (error) {
        logger.error('[AuthSettings] Error fetching settings', { error })
        return ResponseFactory.success(defaultSettings)
    }
}, {
    rateLimit: 'admin'
})

// PUT - Update settings
export const PUT = apiHandler(async (req, { body }) => {
    const user = await getCurrentUser(req.headers)

    if (!user || user.role !== 'ADMIN') {
        return ResponseFactory.error('Unauthorized', 403, 'FORBIDDEN')
    }

    const updates = body!

    try {
        // Get current settings
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const current = stored ? JSON.parse(stored) : defaultSettings

        // Deep merge updates
        const merged = {
            oauth: deepMergeOAuth(current.oauth, updates.oauth),
            twoFactor: { ...current.twoFactor, ...updates.twoFactor },
            password: { ...current.password, ...updates.password },
            session: { ...current.session, ...updates.session },
            captcha: { ...current.captcha, ...updates.captcha },
            email: { ...current.email, ...updates.email },
            disposableEmail: { ...current.disposableEmail, ...updates.disposableEmail },
            rateLimit: { ...current.rateLimit, ...updates.rateLimit }
        }

        // ⚠️ ENCRYPTION UPDATE: Encrypt secrets instead of deleting them
        // This allows dynamic updates via Admin Panel while keeping Redis secure.

        const { encrypt } = await import('@/lib/security/encryption')

        // 1. Encrypt OAuth Secrets
        Object.keys(merged.oauth).forEach(key => {
            const provider = merged.oauth[key]
            if (provider.clientSecret && !provider.clientSecret.startsWith('v1:')) {
                provider.clientSecret = encrypt(provider.clientSecret)
            }
            if (provider.botToken && !provider.botToken.startsWith('v1:')) {
                provider.botToken = encrypt(provider.botToken)
            }
        })

        // 2. Encrypt Captcha Secrets
        if (merged.captcha.hcaptchaSecret && !merged.captcha.hcaptchaSecret.startsWith('v1:')) {
            merged.captcha.hcaptchaSecret = encrypt(merged.captcha.hcaptchaSecret)
        }
        if (merged.captcha.recaptchaSecret && !merged.captcha.recaptchaSecret.startsWith('v1:')) {
            merged.captcha.recaptchaSecret = encrypt(merged.captcha.recaptchaSecret)
        }

        // Save to Redis
        await redis.set(AUTH_SETTINGS_KEY, JSON.stringify(merged))

        return ResponseFactory.success(merged)
    } catch (error) {
        console.error('[AuthSettings] Error saving:', error)
        return ResponseFactory.error('Failed to save settings', 500, 'INTERNAL_ERROR')
    }
}, {
    schema: settingsSchema,
    rateLimit: 'admin'
})
