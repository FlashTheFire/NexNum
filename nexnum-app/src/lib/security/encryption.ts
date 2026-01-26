
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits standard

// Lazy load key to support runtime env injection
const getKey = () => {
    const keyHex = process.env.ENCRYPTION_KEY
    if (!keyHex) {
        throw new Error('ENCRYPTION_KEY environment variable is not set')
    }
    // Handle both 32-byte hex string (64 chars) or raw 32-byte string
    // Ideally use 64-char hex string
    if (keyHex.length === 64) {
        return Buffer.from(keyHex, 'hex')
    }
    // Fallback (not recommended for new setups but robust)
    return crypto.scryptSync(keyHex, 'salt', 32)
}

/**
 * Encrypts a string using AES-256-GCM
 * Format: iv:auth_tag:encrypted_content (all hex)
 */
export const encrypt = (text: string): string => {
    if (!text) return ''

    const key = getKey()
    const iv = crypto.randomBytes(IV_LENGTH)

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    // Encrypt
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    // Get auth tag
    const authTag = cipher.getAuthTag()

    // Return formatted string
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypts a string using AES-256-GCM
 * Expects format: iv:auth_tag:encrypted_content
 */
export const decrypt = (text: string): string => {
    if (!text) return ''

    // Check if it looks encrypted (contains colons and hex)
    if (!text.includes(':')) {
        // SECURITY: Throw error for unencrypted data in production
        // In dev, allow gradual migration
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Attempted to decrypt unencrypted data')
        }
        return text
    }

    const parts = text.split(':')
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format')
    }

    const [ivHex, authTagHex, encryptedHex] = parts

    const key = getKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    // Decrypt
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}
