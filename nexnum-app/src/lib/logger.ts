import pino from 'pino'
import { getRequestId, getRequestDuration } from './request-context'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

const pinoLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: {
        env: process.env.NODE_ENV,
    },
    transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'HH:MM:ss',
        }
    } : undefined,
    formatters: {
        level: (label) => {
            return { level: label }
        }
    }
})

class Logger {

    private log(level: LogLevel, message: string, meta?: Record<string, any>) {
        const requestId = getRequestId()
        const duration = getRequestDuration()

        const baseMeta = {
            requestId,
            durationMs: duration,
        }

        const mergedMeta = meta ? { ...baseMeta, ...meta } : baseMeta

        // Pino handles JSON stringification and formatting automatically
        pinoLogger[level](mergedMeta, message)
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

