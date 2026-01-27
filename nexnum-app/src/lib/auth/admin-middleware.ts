import { NextResponse } from 'next/server'
import { getCurrentUser } from './jwt'
import { SecurityLogger } from './security-logger'

/**
 * Professional Admin API Middleware
 * 
 * Protects admin routes with industrial-grade session verification
 * and forensic auditing via SecurityLogger.
 */
export async function adminMiddleware(request: Request) {
    // 1. Session Verification
    const user = await getCurrentUser(request.headers)

    if (!user || user.role !== 'ADMIN') {
        // Log Unauthorized Access Attempt
        await SecurityLogger.log(request, 401, user?.userId, 'Illegal admin access attempt')
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // 2. Log Successful Admin Action (Fire and Forget)
    SecurityLogger.log(request, 200, user.userId)

    return NextResponse.next()
}
