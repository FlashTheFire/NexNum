import { prisma } from '@/lib/core/db'
import { clearAuthCookie } from '@/lib/auth/jwt'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'

// POST /api/auth/logout - Revoke session
export const POST = apiHandler(async (request, { user }) => {
    if (user) {
        try {
            // Increment token version to invalidate all existing tokens for this user
            await prisma.user.update({
                where: { id: user.userId },
                data: {
                    tokenVersion: { increment: 1 }
                }
            })

            // Audit log
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: 'user.logout',
                    resourceType: 'user',
                    resourceId: user.userId,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })
        } catch (error) {
            console.warn('Logout error (non-blocking):', error)
        }
    }

    // Always clear cookie
    await clearAuthCookie()

    return ResponseFactory.success({ message: 'Logged out successfully' })
}, { rateLimit: 'auth' })
