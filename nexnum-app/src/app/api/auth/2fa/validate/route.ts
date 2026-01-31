/**
 * 2FA Login Validation Endpoint (Production Grade)
 * 
 * Validates OTP during login flow. Accepts tempToken + OTP code.
 * On success, issues full session token and sets auth cookie.
 * 
 * Security:
 * - Rate limited (auth tier)
 * - Temp token role verification
 * - Token version check (session invalidation)
 * - Banned user check
 * - Backup code one-time use
 * - Full audit logging
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { prisma } from '@/lib/core/db'
import { verifyTwoFactorToken, verifyBackupCode } from '@/lib/auth/two-factor'
import { verifyToken, generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { z } from 'zod'
import { ResponseFactory } from '@/lib/api/response-factory'
import { auth_events_total } from '@/lib/metrics'

const validateSchema = z.object({
    tempToken: z.string().min(1, 'Session token required'),
    token: z.string().min(6).max(10, 'Code must be 6-10 characters') // 6 for OTP, 10 for backup
})

export const POST = apiHandler(async (req, { body }) => {
    const { tempToken, token: code } = body!
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'

    // 1. Verify temporary token
    const payload = await verifyToken(tempToken)

    if (!payload) {
        auth_events_total.labels('2fa_validate', 'invalid_token').inc()
        return ResponseFactory.error('Session expired. Please login again.', 401, 'INVALID_TOKEN')
    }

    // 2. Security: Ensure this is a 2FA pending token
    if (payload.role !== '2FA_PENDING') {
        auth_events_total.labels('2fa_validate', 'wrong_token_type').inc()
        return ResponseFactory.error('Invalid session type', 401, 'INVALID_TOKEN_TYPE')
    }

    // 3. Fetch user with 2FA data
    const user = await prisma.user.findUnique({
        where: { id: payload.userId as string },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            emailVerified: true,
            tokenVersion: true,
            twoFactorEnabled: true,
            twoFactorSecret: true,
            twoFactorBackupCodes: true,
            isBanned: true
        }
    })

    if (!user) {
        auth_events_total.labels('2fa_validate', 'user_not_found').inc()
        return ResponseFactory.error('User not found', 404, 'USER_NOT_FOUND')
    }

    // 4. Security: Check if user is banned
    if (user.isBanned) {
        auth_events_total.labels('2fa_validate', 'user_banned').inc()
        return ResponseFactory.error('Account suspended', 403, 'ACCOUNT_SUSPENDED')
    }

    // 5. Security: Token version check (session invalidation)
    if (payload.version !== user.tokenVersion) {
        auth_events_total.labels('2fa_validate', 'token_revoked').inc()
        return ResponseFactory.error('Session expired. Please login again.', 401, 'TOKEN_REVOKED')
    }

    // 6. Verify 2FA is enabled
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        auth_events_total.labels('2fa_validate', '2fa_not_enabled').inc()
        return ResponseFactory.error('2FA not configured', 400, '2FA_NOT_CONFIGURED')
    }

    // 7. Attempt OTP verification
    let isValid = await verifyTwoFactorToken(code, user.twoFactorSecret)
    let usedBackupCode = false

    // 8. If OTP fails, try backup codes
    if (!isValid && user.twoFactorBackupCodes && (user.twoFactorBackupCodes as string[]).length > 0) {
        const codeIndex = await verifyBackupCode(
            code,
            user.twoFactorBackupCodes as string[]
        )

        if (codeIndex !== -1) {
            // Valid backup code - remove it (one-time use)
            const updatedCodes = [...(user.twoFactorBackupCodes as string[])]
            updatedCodes.splice(codeIndex, 1)

            await prisma.user.update({
                where: { id: user.id },
                data: { twoFactorBackupCodes: updatedCodes }
            })

            isValid = true
            usedBackupCode = true

            // Audit: Backup code used
            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    action: '2fa.backup_used',
                    resourceType: 'user',
                    resourceId: user.id,
                    ipAddress: ip,
                    metadata: { remainingCodes: updatedCodes.length }
                }
            })
        }
    }

    // 9. Handle invalid code
    if (!isValid) {
        auth_events_total.labels('2fa_validate', 'invalid_code').inc()

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: '2fa.validate_failed',
                resourceType: 'user',
                resourceId: user.id,
                ipAddress: ip
            }
        })

        return ResponseFactory.error('Invalid verification code', 400, 'INVALID_CODE')
    }

    // 10. Success - Generate full session token
    const sessionToken = await generateToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        version: user.tokenVersion
    })

    // 11. Set auth cookie (httpOnly, secure)
    await setAuthCookie(sessionToken)

    // 12. Audit: Successful 2FA validation
    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: '2fa.validate_success',
            resourceType: 'user',
            resourceId: user.id,
            ipAddress: ip,
            metadata: usedBackupCode ? { method: 'backup_code' } : { method: 'totp' }
        }
    })

    auth_events_total.labels('2fa_validate', 'success').inc()

    return ResponseFactory.success({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified
        },
        token: sessionToken
    })
}, {
    schema: validateSchema,
    rateLimit: 'auth'
})
