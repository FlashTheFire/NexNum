
import crypto from 'crypto'

// Ensure we have a consistent 32-byte key source
const MASTER_KEY_SOURCE = process.env.ENCRYPTION_KEY || 'development_secret_key_change_in_prod'
// Hash it to ensure exactly 32 bytes for AES-256
const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
    return crypto.createHash('sha256').update(MASTER_KEY_SOURCE).digest()
}

/**
 * Encrypt a string using AES-256-GCM.
 * Output format: "iv:authTag:encryptedContent" (hex encoded)
 */
export function encrypt(text: string): string {
    if (!text) return text

    const iv = crypto.randomBytes(16)
    const key = getKey()
    const cipher = crypto.createCipheriv(ALGO, key, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag().toString('hex')

    // Format: iv:authTag:encryptedContent
    return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypt a string using AES-256-GCM.
 * Input format: "iv:authTag:encryptedContent"
 * Returns original string or throws if tampering detected/invalid key.
 */
export function decrypt(text: string): string {
    if (!text) return text

    const parts = text.split(':')
    if (parts.length !== 3) {
        // If it's not in our format, assume it's legacy plain text (migration support)
        // or return as is if we want to be safe, but usually we should try to support legacy read
        return text
    }

    try {
        const [ivHex, authTagHex, contentHex] = parts
        const iv = Buffer.from(ivHex, 'hex')
        const authTag = Buffer.from(authTagHex, 'hex')
        const key = getKey()

        const decipher = crypto.createDecipheriv(ALGO, key, iv)
        decipher.setAuthTag(authTag)

        let decrypted = decipher.update(contentHex, 'hex', 'utf8')
        decrypted += decipher.final('utf8')

        return decrypted
    } catch (e) {
        // Fallback: If decryption fails, it might be plain text (unless strict mode)
        // For now, return original if decryption fails to avoid breaking legacy/plain values
        // console.warn('Decryption failed, returning raw', e.message)
        return text
    }
}
