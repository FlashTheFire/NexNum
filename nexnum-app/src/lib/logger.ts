export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
    level: LogLevel
    message: string
    meta?: Record<string, any>
    timestamp: string
}

class Logger {
    private isDev = process.env.NODE_ENV === 'development'

    private log(level: LogLevel, message: string, meta?: Record<string, any>) {
        const entry: LogEntry = {
            level,
            message,
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

            console[level](`${color}[${level.toUpperCase()}]\x1b[0m ${message}`, meta || '')
        } else {
            // JSON structured logging for production (Datadog/CloudWatch friendly)
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
}

export const logger = new Logger()
