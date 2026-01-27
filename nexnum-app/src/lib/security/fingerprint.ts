/**
 * Device Fingerprinting (Industrial/Forensic Grade)
 * 
 * Collects persistent device characteristics to:
 * 1. Detect suspicious device changes (Account Takeover Protection)
 * 2. Empower high-fidelity rate limiting
 * 3. Track session consistency across IP changes
 */

import { createHash } from 'crypto'

const FINGERPRINT_SALT = process.env.FINGERPRINT_SALT || 'dev-fingerprint-salt'

export interface DeviceFingerprint {
    hash: string
    components: {
        userAgent: string
        language: string
        platform?: string
        mobile?: boolean
        hints?: string
        timezone?: string
        screenInfo?: string
    }
}

/**
 * Generate device fingerprint with Modern Client Hints
 */
export function generateFingerprint(headers: Headers, clientData?: {
    timezone?: string
    screen?: string
}): DeviceFingerprint {
    const userAgent = headers.get('user-agent') || ''
    const language = headers.get('accept-language') || ''

    // Modern Client Hints - Significantly more stable & harder to spoof
    const chUa = headers.get('sec-ch-ua') || ''
    const chMobile = headers.get('sec-ch-ua-mobile') === '?1'
    const chPlatform = headers.get('sec-ch-ua-platform') || ''

    const components = {
        userAgent: userAgent.slice(0, 300),
        language: language.slice(0, 100),
        platform: chPlatform,
        mobile: chMobile,
        hints: chUa,
        timezone: clientData?.timezone,
        screenInfo: clientData?.screen
    }

    // Create stable hash with server-side salt
    const fingerString = [
        FINGERPRINT_SALT,
        components.userAgent,
        components.language,
        components.platform,
        components.mobile ? '1' : '0',
        components.hints,
        components.timezone || '',
        components.screenInfo || ''
    ].join('|')

    const hash = createHash('sha256')
        .update(fingerString)
        .digest('hex')
        .slice(0, 32)

    return { hash, components }
}

/**
 * Compare two fingerprints with Modern Weighting
 */
export function compareFingerprints(fp1: DeviceFingerprint, fp2: DeviceFingerprint): number {
    if (fp1.hash === fp2.hash) return 1.0

    let matches = 0
    let total = 0

    const c1 = fp1.components
    const c2 = fp2.components

    // MODERN HINTS (Weighted Highest)
    if (c1.hints && c2.hints) {
        if (c1.hints === c2.hints) matches += 4
        total += 4
    }

    if (c1.platform && c2.platform) {
        if (c1.platform === c2.platform) matches += 3
        total += 3
    }

    // User Agent (Lower weight as it's easily spoofed)
    if (c1.userAgent === c2.userAgent) matches += 2
    total += 2

    if (c1.language === c2.language) matches += 1
    total += 1

    if (c1.timezone && c2.timezone && c1.timezone === c2.timezone) matches += 1
    if (c1.timezone || c2.timezone) total += 1

    return total > 0 ? matches / total : 0
}

export function isSuspiciousChange(oldFp: DeviceFingerprint, newFp: DeviceFingerprint): boolean {
    const similarity = compareFingerprints(oldFp, newFp)
    // 60% similarity threshold for hardened fingerprinting
    return similarity < 0.6
}

export function createRateLimitKey(ip: string, fingerprint: DeviceFingerprint): string {
    return `${ip}:${fingerprint.hash.slice(0, 16)}`
}

export function getFingerprintId(headers: Headers): string {
    return generateFingerprint(headers).hash.slice(0, 16)
}
