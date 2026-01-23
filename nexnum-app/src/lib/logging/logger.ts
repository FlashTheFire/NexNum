
/**
 * Structured Logger for Enterprise Observability.
 * Outputs JSON in production, pretty text in development.
 */

const isProduction = process.env.NODE_ENV === 'production'

export const logger = {
    info: (message: string, context?: Record<string, any>) => {
        if (isProduction) {
            console.log(JSON.stringify({ level: 'info', message, ...context, timestamp: new Date().toISOString() }))
        } else {
            console.log(`[INFO] ${message}`, context || '')
        }
    },

    warn: (message: string, context?: Record<string, any>) => {
        if (isProduction) {
            console.warn(JSON.stringify({ level: 'warn', message, ...context, timestamp: new Date().toISOString() }))
        } else {
            console.warn(`[WARN] ${message}`, context || '')
        }
    },

    error: (message: string, error?: any, context?: Record<string, any>) => {
        if (isProduction) {
            console.error(JSON.stringify({
                level: 'error',
                message,
                error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
                ...context,
                timestamp: new Date().toISOString()
            }))
        } else {
            console.error(`[ERROR] ${message}`, error || '', context || '')
        }
    },

    debug: (message: string, context?: Record<string, any>) => {
        if (process.env.DEBUG) {
            console.debug(`[DEBUG] ${message}`, context || '')
        }
    }
}
