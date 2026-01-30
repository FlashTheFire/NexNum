import { TOTP } from '@otplib/totp'
import QRCode from 'qrcode'
import crypto from 'crypto'
import { logger } from '@/lib/core/logger'


const SERVICE_NAME = 'NexNum'
const totp = new TOTP()


/**
 * Generates a new TOTP secret and otpauth URL for a user
 */
export function generateTwoFactorSecret(email: string) {
    const secret = totp.generateSecret()
    // Manual keyuri construction since toURI might be different or require specific options
    // Format: otpauth://totp/Label?secret=Secret&issuer=Issuer
    const label = `${SERVICE_NAME}:${email}`
    const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(SERVICE_NAME)}&algorithm=SHA1&digits=6&period=30`

    return { secret, otpauth }
}

/**
 * Generates a QR code data URL from an otpauth URL
 */
export async function generateQrCode(otpauthUrl: string): Promise<string> {
    return await QRCode.toDataURL(otpauthUrl)
}

/**
 * Verifies a TOTP token against a secret
 */
export async function verifyTwoFactorToken(token: string, secret: string): Promise<boolean> {
    try {
        const result = await totp.verify(token, { secret })
        return result.valid
    } catch (e: any) {
        logger.error('2FA Verification error', { error: e.message })
        return false
    }
}

/**
 * Generates restoration backup codes
 * Returns 10 codes, each 10 hex characters long
 */
export function generateBackupCodes(count = 10): string[] {
    const codes: string[] = []
    for (let i = 0; i < count; i++) {
        const code = crypto.randomBytes(5).toString('hex').toUpperCase() // 10 chars
        codes.push(code)
    }
    return codes
}
