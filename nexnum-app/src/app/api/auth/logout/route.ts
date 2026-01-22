import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser, clearAuthCookie } from '@/lib/auth/jwt'
import { apiHandler } from '@/lib/api/api-handler'

// POST /api/auth/logout - Revoke session
export const POST = apiHandler(async (request) => {
    try {
        const user = await getCurrentUser(request.headers)

        if (user) {
            // Increment token version to invalidate all existing tokens for this user
            // We use updateMany in case we want to support multiple devices later or just simple ID check
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
        }
    } catch (error) {
        console.warn('Logout error (non-blocking):', error)
    }

    // Always clear cookie
    await clearAuthCookie()

    return NextResponse.json({ success: true, message: 'Logged out successfully' })
}, { rateLimit: 'auth' })
