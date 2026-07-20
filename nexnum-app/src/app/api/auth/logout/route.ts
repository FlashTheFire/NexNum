import { prisma } from '@/lib/core/db'
import { clearAuthCookie } from '@/lib/auth/jwt'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { logger } from '@/lib/core/logger'

// POST /api/auth/logout - Revoke session
export const POST = apiHandler(async (request, { user, security }) => {
    if (user) {
        try {
            // Increment token version to invalidate all existing tokens for this user
            await prisma.user.update({
                where: { id: user.userId },
                data: {
                    tokenVersion: { increment: 1 }
                }
            })

            // Audit log — H7: use security context IP instead of raw header
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: 'user.logout',
                    resourceType: 'user',
                    resourceId: user.userId,
                    ipAddress: security?.clientIp || 'unknown'
                }
            })
        } catch (error) {
            logger.warn('Logout error (non-blocking)', { error })
        }
    }

    // Always clear cookie
    await clearAuthCookie()

    return ResponseFactory.success({ message: 'Logged out successfully' })
}, { rateLimit: 'auth' })
