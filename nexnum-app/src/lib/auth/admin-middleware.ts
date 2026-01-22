import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { redis } from '@/lib/core/redis'

const LOGS_KEY = 'admin:api_logs'
const MAX_LOGS = 100

// Log an API request to Redis
async function logApiRequest(request: Request, status: number = 200, duration: number = 0) {
    try {
        const url = new URL(request.url)
        const logEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            method: request.method,
            path: url.pathname,
            status,
            duration,
            ip: request.headers.get('x-forwarded-for') || 'unknown'
        }

        // Push to Redis list (non-blocking, fire and forget)
        await redis.lpush(LOGS_KEY, JSON.stringify(logEntry))
        await redis.ltrim(LOGS_KEY, 0, MAX_LOGS - 1)
    } catch (e) {
        // Don't let logging errors affect the request
        console.error('API log error:', e)
    }
}

export async function adminMiddleware(request: Request) {
    const startTime = Date.now()
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0]

    if (!token) {
        await logApiRequest(request, 401, Date.now() - startTime)
        return NextResponse.redirect(new URL('/login', request.url))
    }

    const payload = await verifyToken(token)
    if (!payload) {
        await logApiRequest(request, 401, Date.now() - startTime)
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Log successful admin API access
    await logApiRequest(request, 200, Date.now() - startTime)

    return NextResponse.next()
}

// Export logApiRequest for use in other API routes
export { logApiRequest }
