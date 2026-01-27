import { redis } from '@/lib/core/redis'
import { getRequestId, getTraceId } from '@/lib/api/request-context'
import { logger } from '@/lib/core/logger'

/**
 * Professional Security Logger
 * 
 * Standardizes logging of sensitive security events (Login, Admin Access, Denials).
 * Integrated with Redis for high-performance non-blocking auditing.
 */

const LOGS_KEY = 'admin:api_logs'
const MAX_LOGS = 100

export interface SecurityEvent {
    id: string
    timestamp: string
    method: string
    path: string
    status: number
    ip: string
    requestId: string
    traceId: string
    userId?: string
    error?: string
}

export class SecurityLogger {
    /**
     * Log a security-sensitive event to Redis
     */
    static async log(req: Request, status: number, userId?: string, error?: string) {
        try {
            const url = new URL(req.url)

            const event: SecurityEvent = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                method: req.method,
                path: url.pathname,
                status,
                ip: req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown',
                requestId: getRequestId(),
                traceId: getTraceId(),
                userId,
                error
            }

            // Fire and Forget (don't block the request)
            redis.lpush(LOGS_KEY, JSON.stringify(event))
                .then(() => redis.ltrim(LOGS_KEY, 0, MAX_LOGS - 1))
                .catch(err => logger.error('[SecurityLogger] Redis write failed', { error: err.message }))

        } catch (e: any) {
            logger.error('[SecurityLogger] Failed to capture event', { error: e.message })
        }
    }

    /**
     * Get recent security logs
     */
    static async getRecentLogs(limit: number = 50): Promise<SecurityEvent[]> {
        const rawLogs = await redis.lrange(LOGS_KEY, 0, limit - 1)
        return rawLogs.map(log => JSON.parse(log))
    }
}
