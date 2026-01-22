/**
 * Device Fingerprinting
 * 
 * Collects device characteristics to:
 * 1. Detect suspicious device changes
 * 2. Add fingerprint-based rate limiting
 * 3. Track session consistency
 * 
 * Note: This is server-side fingerprinting from headers.
 * For more accurate fingerprinting, use client-side libraries.
 */

import { createHash } from 'crypto'

export interface DeviceFingerprint {
    hash: string
    components: {
        userAgent: string
        language: string
        encoding: string
        timezone?: string
        screenInfo?: string
    }
}

/**
 * Generate device fingerprint from headers
 * This is a basic server-side fingerprint - accuracy varies
 */
export function generateFingerprint(headers: Headers, clientData?: {
    timezone?: string
    screen?: string
}): DeviceFingerprint {
    const userAgent = headers.get('user-agent') || ''
    const language = headers.get('accept-language') || ''
    const encoding = headers.get('accept-encoding') || ''

    const components = {
        userAgent: userAgent.slice(0, 300),
        language: language.slice(0, 100),
        encoding,
        timezone: clientData?.timezone,
        screenInfo: clientData?.screen
    }

    // Create stable hash
    const fingerString = [
        components.userAgent,
        components.language,
        components.encoding,
        components.timezone || '',
        components.screenInfo || ''
    ].join('|')

    const hash = createHash('sha256')
        .update(fingerString)
        .digest('hex')
        .slice(0, 32) // Shortened for storage

    return { hash, components }
}

/**
 * Compare two fingerprints for similarity
 * Returns a score from 0 (completely different) to 1 (identical)
 */
export function compareFingerprints(fp1: DeviceFingerprint, fp2: DeviceFingerprint): number {
    if (fp1.hash === fp2.hash) return 1.0

    let matches = 0
    let total = 0

    // Compare components
    const c1 = fp1.components
    const c2 = fp2.components

    // Major components weighted more
    if (c1.userAgent === c2.userAgent) matches += 3
    total += 3

    if (c1.language === c2.language) matches += 2
    total += 2

    if (c1.encoding === c2.encoding) matches += 1
    total += 1

    if (c1.timezone && c2.timezone && c1.timezone === c2.timezone) matches += 2
    if (c1.timezone || c2.timezone) total += 2

    if (c1.screenInfo && c2.screenInfo && c1.screenInfo === c2.screenInfo) matches += 2
    if (c1.screenInfo || c2.screenInfo) total += 2

    return total > 0 ? matches / total : 0
}

/**
 * Check if fingerprint changed significantly (potential account takeover)
 */
export function isSuspiciousChange(oldFp: DeviceFingerprint, newFp: DeviceFingerprint): boolean {
    const similarity = compareFingerprints(oldFp, newFp)
    // Less than 50% similarity is suspicious
    return similarity < 0.5
}

/**
 * Create fingerprint identifier for rate limiting
 * Combines IP + fingerprint for more accurate identification
 */
export function createRateLimitKey(ip: string, fingerprint: DeviceFingerprint): string {
    return `${ip}:${fingerprint.hash.slice(0, 16)}`
}

/**
 * Get lightweight fingerprint ID for logging
 */
export function getFingerprintId(headers: Headers): string {
    return generateFingerprint(headers).hash.slice(0, 16)
}
