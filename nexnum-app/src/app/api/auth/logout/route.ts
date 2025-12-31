import { NextResponse } from 'next/server'
import { clearAuthCookie, getCurrentUser } from '@/lib/jwt'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        // Clear auth cookie
        await clearAuthCookie()

        // Audit log if user was logged in
        if (user) {
            await prisma.auditLog.create({
                data: {
                    userId: user.userId,
                    action: 'user.logout',
                    resourceType: 'user',
                    resourceId: user.userId,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                }
            })
        }

        return NextResponse.json({
            success: true,
            message: 'Logged out successfully'
        })

    } catch (error) {
        console.error('Logout error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
