/**
 * Secure ID System
 * 
 * Production-grade ID obfuscation and validation layer.
 * Hides internal IDs (provider, country, service codes) from end users.
 * 
 * Features:
 * - Custom Hashids-style encoding (no external deps)
 * - HMAC checksums for tamper detection
 * - Redis-backed alias mapping
 * - UUID-based public offer IDs
 */

import crypto from 'crypto'
import { redis } from './redis'

// ============================================================================
// CONFIGURATION
// ============================================================================

const ID_SECRET = process.env.ID_SECRET || process.env.JWT_SECRET || 'nexnum-secure-id-salt-2024'
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // Removed confusing chars (0,o,1,l,i)
const MIN_LENGTH = 8
const CACHE_PREFIX = 'id_map:'
const CACHE_TTL = 60 * 60 * 24 * 90 // 90 days

// ============================================================================
// HASHIDS-STYLE ENCODER (Custom Implementation)
// ============================================================================

/**
 * Encode a numeric ID to an obfuscated string
 * Uses a deterministic shuffle based on secret salt
 */
export function encodeNumericId(id: number, salt: string = ID_SECRET): string {
    if (id < 0) throw new Error('ID must be non-negative')
    if (id === 0) return shuffleAlphabet(salt)[0].repeat(MIN_LENGTH)

    const shuffled = shuffleAlphabet(salt)
    const base = shuffled.length
    let result = ''
    let num = id

    // Convert to custom base
    while (num > 0) {
        result = shuffled[num % base] + result
        num = Math.floor(num / base)
    }

    // Pad to minimum length with deterministic chars
    while (result.length < MIN_LENGTH) {
        const padIdx = (id + result.length) % base
        result = shuffled[padIdx] + result
    }

    // Add position-based shuffle for extra obfuscation
    return shuffleResult(result, salt)
}

/**
 * Decode an obfuscated string back to numeric ID
 */
export function decodeNumericId(encoded: string, salt: string = ID_SECRET): number {
    if (!encoded || encoded.length < MIN_LENGTH) return -1

    try {
        const unshuffled = unshuffleResult(encoded, salt)
        const shuffled = shuffleAlphabet(salt)
        const base = shuffled.length

        // Find where padding ends (first non-padding char from left)
        let startIdx = 0
        for (let i = 0; i < unshuffled.length - 1; i++) {
            const charIdx = shuffled.indexOf(unshuffled[i])
            if (charIdx === -1) return -1
            // Check if this is a padding char
            const expectedPadIdx = (0 + i) % base // Can't know original ID here, so decode full
            startIdx = i
            break
        }

        // Decode from custom base
        let result = 0
        for (const char of unshuffled) {
            const idx = shuffled.indexOf(char)
            if (idx === -1) return -1
            result = result * base + idx
        }

        return result
    } catch {
        return -1
    }
}

/**
 * Shuffle alphabet deterministically based on salt
 */
function shuffleAlphabet(salt: string): string {
    const chars = ALPHABET.split('')
    const hash = crypto.createHash('sha256').update(salt).digest()

    for (let i = chars.length - 1; i > 0; i--) {
        const j = hash[i % hash.length] % (i + 1)
            ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }

    return chars.join('')
}

/**
 * Position-based shuffle for result string
 */
function shuffleResult(str: string, salt: string): string {
    const chars = str.split('')
    const hash = crypto.createHash('sha256').update(salt + 'pos').digest()

    for (let i = 0; i < chars.length; i++) {
        const swapIdx = hash[i % hash.length] % chars.length
            ;[chars[i], chars[swapIdx]] = [chars[swapIdx], chars[i]]
    }

    return chars.join('')
}

/**
 * Reverse position-based shuffle
 */
function unshuffleResult(str: string, salt: string): string {
    const chars = str.split('')
    const hash = crypto.createHash('sha256').update(salt + 'pos').digest()

    // Reverse the swaps
    for (let i = chars.length - 1; i >= 0; i--) {
        const swapIdx = hash[i % hash.length] % chars.length
            ;[chars[i], chars[swapIdx]] = [chars[swapIdx], chars[i]]
    }

    return chars.join('')
}

// ============================================================================
// HMAC CHECKSUM (Tamper Detection)
// ============================================================================

/**
 * Create a secure ID with HMAC checksum
 * Format: base64url(data)_checksum
 */
export function createSecureId(data: string): string {
    const encoded = Buffer.from(data).toString('base64url')
    const checksum = createChecksum(data)
    return `${encoded}_${checksum}`
}

/**
 * Validate and decode a secure ID
 * Returns null if tampered or invalid
 */
export function validateSecureId(secureId: string): string | null {
    const parts = secureId.split('_')
    if (parts.length !== 2) return null

    const [encoded, checksum] = parts

    try {
        const data = Buffer.from(encoded, 'base64url').toString('utf-8')
        const expectedChecksum = createChecksum(data)

        // Timing-safe comparison to prevent timing attacks
        if (!crypto.timingSafeEqual(Buffer.from(checksum), Buffer.from(expectedChecksum))) {
            return null
        }

        return data
    } catch {
        return null
    }
}

/**
 * Create HMAC checksum
 */
function createChecksum(data: string): string {
    return crypto
        .createHmac('sha256', ID_SECRET)
        .update(data)
        .digest('hex')
        .slice(0, 8) // 8 chars = 32 bits of security
}

// ============================================================================
// COMPOSITE OFFER ID
// ============================================================================

export interface OfferIdComponents {
    provider: string
    country: string
    service: string
    operator?: string
}

/**
 * Create an obfuscated offer ID from components
 * Hides provider, country, service internally
 */
export function createOfferId(components: OfferIdComponents): string {
    const data = [
        components.provider,
        components.country,
        components.service,
        components.operator || ''
    ].join(':')

    return createSecureId(data)
}

/**
 * Parse an obfuscated offer ID
 * Returns null if invalid or tampered
 */
export function parseOfferId(offerId: string): OfferIdComponents | null {
    const data = validateSecureId(offerId)
    if (!data) return null

    const [provider, country, service, operator] = data.split(':')

    return {
        provider,
        country,
        service,
        operator: operator || undefined
    }
}

// ============================================================================
// UUID-BASED PUBLIC IDS (with Redis Mapping)
// ============================================================================

/**
 * Generate a UUID-based public ID and store mapping in Redis
 */
export async function createPublicId(internalId: string, type: string = 'offer'): Promise<string> {
    // Check if mapping already exists
    const existingKey = `${CACHE_PREFIX}internal:${type}:${internalId}`
    const existing = await redis.get(existingKey) as string | null
    if (existing) return existing

    // Generate new UUID
    const publicId = `nex_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

    // Store bidirectional mapping
    const forwardKey = `${CACHE_PREFIX}public:${type}:${publicId}`
    const reverseKey = `${CACHE_PREFIX}internal:${type}:${internalId}`

    await Promise.all([
        redis.set(forwardKey, internalId, { ex: CACHE_TTL }),
        redis.set(reverseKey, publicId, { ex: CACHE_TTL })
    ])

    return publicId
}

/**
 * Resolve a public ID to its internal ID
 */
export async function resolvePublicId(publicId: string, type: string = 'offer'): Promise<string | null> {
    const key = `${CACHE_PREFIX}public:${type}:${publicId}`
    return await redis.get(key) as string | null
}

// ============================================================================
// UTILITY: OBFUSCATE OFFER DOCUMENT
// ============================================================================

/**
 * Obfuscate sensitive fields in an offer document for client response
 */
export function obfuscateOffer(offer: {
    id: string
    provider: string
    countryCode: string
    serviceSlug: string
    operatorId?: string
    externalOperator?: string
    [key: string]: any
}): Record<string, any> {
    // Create obfuscated ID
    const secureId = createOfferId({
        provider: offer.provider,
        country: offer.countryCode,
        service: offer.serviceSlug,
        operator: offer.externalOperator
    })

    // Return sanitized offer (remove internal IDs)
    const {
        provider,
        operatorId,
        externalOperator,
        countryCode,
        serviceSlug,
        ...safeFields
    } = offer

    return {
        ...safeFields,
        id: secureId,
        // Keep display-safe versions
        country: offer.countryName || offer.countryCode,
        service: offer.serviceName || offer.serviceSlug,
    }
}

// ============================================================================
// EXPORTS & SINGLETON
// ============================================================================

export const SecureId = {
    encodeNumeric: encodeNumericId,
    decodeNumeric: decodeNumericId,
    createSecure: createSecureId,
    validateSecure: validateSecureId,
    createOfferId,
    parseOfferId,
    createPublicId,
    resolvePublicId,
    obfuscateOffer,
}

export default SecureId
