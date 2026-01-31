/**
 * Disposable Email Checker Service
 * 
 * Detects temporary/disposable email addresses to prevent abuse.
 * Uses DeBounce Free API (primary) with Kickbox Open fallback.
 * Both APIs are completely free with no authentication required.
 * Results cached in Redis for 24 hours.
 */

import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

const CACHE_TTL = 86400 // 24 hours
const CACHE_PREFIX = 'email:disposable:'

interface EmailCheckResult {
    isDisposable: boolean
    isPublic: boolean
    isValid: boolean
    provider: string
    cached: boolean
}

/**
 * Check if an email is from a disposable/temporary email provider
 */
export async function checkDisposableEmail(email: string): Promise<EmailCheckResult> {
    const domain = email.split('@')[1]?.toLowerCase()

    if (!domain) {
        return { isDisposable: false, isPublic: false, isValid: false, provider: 'validation', cached: false }
    }

    // Check cache first
    const cached = await getCachedResult(domain)
    if (cached) {
        return { ...cached, cached: true }
    }

    // Try DeBounce Free API first (no auth required)
    const debounceResult = await checkWithDeBounce(email)
    if (debounceResult) {
        await cacheResult(domain, debounceResult)
        return { ...debounceResult, cached: false }
    }

    // Fallback to Kickbox Open (also free, no API key required)
    const kickboxResult = await checkWithKickbox(domain)
    if (kickboxResult) {
        await cacheResult(domain, kickboxResult)
        return { ...kickboxResult, cached: false }
    }

    // If all APIs fail, return safe default
    return { isDisposable: false, isPublic: false, isValid: true, provider: 'fallback', cached: false }
}

/**
 * DeBounce Free Disposable Email API (Primary - no auth required)
 * https://disposable.debounce.io/?email=test@example.com
 */
async function checkWithDeBounce(email: string): Promise<Omit<EmailCheckResult, 'cached'> | null> {
    try {
        const res = await fetch(`https://disposable.debounce.io/?email=${encodeURIComponent(email)}`, {
            signal: AbortSignal.timeout(5000)
        })

        if (!res.ok) {
            logger.warn('[DisposableCheck] DeBounce API error', { status: res.status })
            return null
        }

        const data = await res.json()
        return {
            isDisposable: data.disposable === 'true' || data.disposable === true,
            isPublic: false,
            isValid: true,
            provider: 'debounce'
        }
    } catch (error) {
        logger.error('[DisposableCheck] DeBounce API failed', { error })
        return null
    }
}

/**
 * Kickbox Open API (Fallback - free, no auth required)
 * https://open.kickbox.com/v1/disposable/{domain}
 */
async function checkWithKickbox(domain: string): Promise<Omit<EmailCheckResult, 'cached'> | null> {
    try {
        const res = await fetch(`https://open.kickbox.com/v1/disposable/${encodeURIComponent(domain)}`, {
            signal: AbortSignal.timeout(5000)
        })

        if (!res.ok) {
            logger.warn('[DisposableCheck] Kickbox API error', { status: res.status })
            return null
        }

        const data = await res.json()
        return {
            isDisposable: data.disposable === true,
            isPublic: false,
            isValid: true,
            provider: 'kickbox'
        }
    } catch (error) {
        logger.error('[DisposableCheck] Kickbox API failed', { error })
        return null
    }
}

/**
 * Cache helpers
 */
async function getCachedResult(domain: string): Promise<Omit<EmailCheckResult, 'cached'> | null> {
    try {
        const cached = await redis.get(`${CACHE_PREFIX}${domain}`)
        return cached ? JSON.parse(cached) : null
    } catch {
        return null
    }
}

async function cacheResult(domain: string, result: Omit<EmailCheckResult, 'cached'>): Promise<void> {
    try {
        await redis.setex(`${CACHE_PREFIX}${domain}`, CACHE_TTL, JSON.stringify(result))
    } catch (error) {
        logger.warn('[DisposableCheck] Cache write failed', { error })
    }
}

/**
 * Get auth settings for disposable email check
 */
export async function isDisposableCheckEnabled(): Promise<boolean> {
    try {
        const settings = await redis.get('system:auth_settings')
        if (settings) {
            const parsed = JSON.parse(settings)
            return parsed.disposableEmail?.enabled !== false
        }
        return true // Enabled by default
    } catch {
        return true
    }
}
