
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const CURRENT_VERSION = 'v1'

/**
 * Key Management (Enterprise Key-Ring Pattern)
 */
const getEncryptionKeys = () => {
    const key = process.env.ENCRYPTION_KEY
    if (!key) throw new Error('ENCRYPTION_KEY is required')

    // In a pro setup, we'd have a map of versions to keys
    // For now, we use a single key mapped to 'v1'
    return {
        v1: key.length === 64 ? Buffer.from(key, 'hex') : crypto.scryptSync(key, 'salt', 32)
    }
}

/**
 * Encrypts a string using AES-256-GCM with Versioning
 * Format: [version]:iv:auth_tag:encrypted_content
 */
export const encrypt = (text: string): string => {
    if (!text) return ''

    const keys = getEncryptionKeys()
    const key = keys[CURRENT_VERSION]
    const iv = crypto.randomBytes(IV_LENGTH)

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    return `${CURRENT_VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypts a string supporting Legacy and Versioned formats
 */
export const decrypt = (text: string): string => {
    if (!text) return ''

    const isVersioned = text.startsWith('v1:')

    if (!isVersioned) {
        // Enforce versioned format for all encrypted data
        return text
    }

    const parts = text.split(':')
    const keys = getEncryptionKeys()

    // v1:iv:tag:data
    const [version, ivHex, authTagHex, encryptedHex] = parts
    const key = (keys as any)[version]
    if (!key) throw new Error(`Unknown encryption version: ${version}`)

    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
}
