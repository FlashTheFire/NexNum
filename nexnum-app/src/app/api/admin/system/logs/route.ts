import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { redis } from '@/lib/core/redis'

export const dynamic = 'force-dynamic'

// Redis key for storing recent API logs (same as in admin-middleware)
const LOGS_KEY = 'admin:api_logs'

export interface ApiLogEntry {
    id: string
    timestamp: string
    method: string
    path: string
    status: number
    duration: number
    ip?: string
}

// GET - Fetch recent logs from Redis
export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        // Get recent logs from Redis list
        const logs = await redis.lrange(LOGS_KEY, 0, 49)
        const parsedLogs: ApiLogEntry[] = logs.map(log => {
            try {
                return JSON.parse(log)
            } catch {
                return null
            }
        }).filter(Boolean) as ApiLogEntry[]

        return NextResponse.json({ logs: parsedLogs })
    } catch (error) {
        console.error('Error fetching logs:', error)
        return NextResponse.json({ logs: [] })
    }
}
