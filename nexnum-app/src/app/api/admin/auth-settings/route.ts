/**
 * Admin Authentication Settings API
 * 
 * GET - Retrieve current auth settings
 * PUT - Update auth settings (admin only)
 * 
 * Settings are stored in Redis and cached for performance.
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { redis } from '@/lib/core/redis'
import { getCurrentUser } from '@/lib/auth/jwt'
import { z } from 'zod'
import { ResponseFactory } from '@/lib/api/response-factory'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

// Default settings
const defaultSettings = {
    oauth: {
        google: { enabled: true, clientId: process.env.GOOGLE_CLIENT_ID || '' },
        github: { enabled: false, clientId: '' }
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
        provider: 'hcaptcha' as const
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
        google: z.object({
            enabled: z.boolean(),
            clientId: z.string()
        }),
        github: z.object({
            enabled: z.boolean(),
            clientId: z.string()
        })
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
        provider: z.enum(['hcaptcha', 'recaptcha'])
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

// GET - Retrieve settings
export const GET = apiHandler(async (req) => {
    const user = await getCurrentUser(req.headers)

    if (!user || user.role !== 'ADMIN') {
        return ResponseFactory.error('Unauthorized', 403, 'FORBIDDEN')
    }

    try {
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : defaultSettings

        return ResponseFactory.success(settings)
    } catch (error) {
        console.error('[AuthSettings] Error fetching:', error)
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
            oauth: { ...current.oauth, ...updates.oauth },
            twoFactor: { ...current.twoFactor, ...updates.twoFactor },
            password: { ...current.password, ...updates.password },
            session: { ...current.session, ...updates.session },
            captcha: { ...current.captcha, ...updates.captcha },
            email: { ...current.email, ...updates.email },
            disposableEmail: { ...current.disposableEmail, ...updates.disposableEmail },
            rateLimit: { ...current.rateLimit, ...updates.rateLimit }
        }

        // Preserve nested OAuth structures
        if (updates.oauth?.google) {
            merged.oauth.google = { ...current.oauth?.google, ...updates.oauth.google }
        }
        if (updates.oauth?.github) {
            merged.oauth.github = { ...current.oauth?.github, ...updates.oauth.github }
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
