import { getRequestId, getRequestDuration } from './request-context'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
    level: LogLevel
    message: string
    requestId?: string
    durationMs?: number
    meta?: Record<string, any>
    timestamp: string
}

class Logger {
    private isDev = process.env.NODE_ENV === 'development'

    private log(level: LogLevel, message: string, meta?: Record<string, any>) {
        const requestId = getRequestId()
        const duration = getRequestDuration()

        const entry: LogEntry = {
            level,
            message,
            requestId,
            durationMs: duration,
            meta,
            timestamp: new Date().toISOString(),
        }

        if (this.isDev) {
            // Pretty print in development
            const color = {
                info: '\x1b[36m',  // Cyan
                warn: '\x1b[33m',  // Yellow
                error: '\x1b[31m', // Red
                debug: '\x1b[90m', // Gray
            }[level]

            const idStr = requestId ? `\x1b[90m[${requestId}]\x1b[0m ` : ''
            const durStr = duration ? `\x1b[90m(${duration}ms)\x1b[0m ` : ''
            console[level](`${color}[${level.toUpperCase()}]${durStr}\x1b[0m ${idStr}${message}`, meta || '')
        } else {
            // JSON structured logging for production (Datadog/CloudWatch/Sentry friendly)
            console.log(JSON.stringify(entry))
        }
    }

    info(message: string, meta?: Record<string, any>) {
        this.log('info', message, meta)
    }

    warn(message: string, meta?: Record<string, any>) {
        this.log('warn', message, meta)
    }

    error(message: string, meta?: Record<string, any>) {
        this.log('error', message, meta)
    }

    debug(message: string, meta?: Record<string, any>) {
        this.log('debug', message, meta)
    }

    /**
     * Log API request (call at start of request)
     */
    request(method: string, path: string, meta?: Record<string, any>) {
        this.info(`→ ${method} ${path}`, meta)
    }

    /**
     * Log API response (call at end of request)
     */
    response(method: string, path: string, status: number, meta?: Record<string, any>) {
        const duration = getRequestDuration()
        const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
        this.log(level, `← ${method} ${path} ${status}`, { ...meta, durationMs: duration })
    }
}

export const logger = new Logger()

