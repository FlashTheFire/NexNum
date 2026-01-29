
import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import { redis } from '@/lib/core/redis'

const LOGS_KEY = 'admin:api_logs'
const MAX_LOGS = 100

export async function POST(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { path, action } = body

        if (!path) return NextResponse.json({ error: 'Path required' }, { status: 400 })

        // Create a custom log entry for the navigation/action
        const logEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            method: 'VIEW', // Custom method name for page views
            path: path,
            status: 200,
            duration: 0,
            ip: request.headers.get('x-forwarded-for') || 'internal'
        }

        // Push to Redis list
        await redis.lpush(LOGS_KEY, JSON.stringify(logEntry))
        await redis.ltrim(LOGS_KEY, 0, MAX_LOGS - 1)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error logging activity:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

