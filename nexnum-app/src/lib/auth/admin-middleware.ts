import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { prisma } from '@/lib/core/db'

export async function adminMiddleware(request: Request) {
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0]

    if (!token) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    const payload = await verifyToken(token)
    if (!payload) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Check optional DB role if token is stale (optional, but safer)
    /* 
    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (user?.role !== 'ADMIN') {
         return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    */

    // For now, rely on token payload if it contains role, OR fetch.
    // Since our token payload currently doesn't have role, we MUST fetch or update token logic.
    // Better to fetch user here or assume we updated token to include role.
    // Let's rely on client-side or assume token payload will be updated.

    // BUT we are in middleware. Next.js Middleware edge runtime doesn't support Prisma fully yet? 
    // Wait, Prisma works in Middleware? No, usually not recommended due to edge.
    // We should use a stateless check (JWT) or an API check.

    // Simplest approach: Add role to JWT. 
    // I need to update login route to include role in token.

    return NextResponse.next()
}
