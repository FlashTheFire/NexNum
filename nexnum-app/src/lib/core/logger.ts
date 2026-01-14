import pino from 'pino'
import { getRequestId, getRequestDuration } from '@/lib/api/request-context'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

const pinoLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { env: process.env.NODE_ENV },
    formatters: { level: (label) => ({ level: label }) }
})

// ═══════════════════════════════════════════════════════════════════════════
// ANSI Color Palette (256-color Premium)
// ═══════════════════════════════════════════════════════════════════════════
const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
    white: "\x1b[37m",
    steel: "\x1b[38;5;75m",
    darkGray: "\x1b[38;5;238m",
    lightGreen: "\x1b[38;5;114m",
    orange: "\x1b[38;5;208m",
    bgBlue: "\x1b[44m", // Added from mock-api
}

const S = {
    info: "◆",
    success: "✔",
    warn: "⚠",
    error: "✖",
    bolt: "⚡",
    box: "❯",
    clock: "⏱️", // Added from mock-api
}

// ═══════════════════════════════════════════════════════════════════════════
// Logger Class (Single-Line In-Place Dashboard)
// ═══════════════════════════════════════════════════════════════════════════
class Logger {
    private isDev = process.env.NODE_ENV === 'development'
    private static hasSplashed = false

    // Dashboard State
    private dashboardActive = false
    private cachedReports: string[] = []

    // ───────────────────────────────────────────────────────────────────────
    // Helpers
    // ───────────────────────────────────────────────────────────────────────
    private ts() {
        return new Date().toLocaleTimeString('en-GB', { hour12: false })
    }

    private levelValue(level: LogLevel): number {
        return { debug: 0, info: 1, warn: 2, error: 3 }[level] ?? 1
    }

    // ───────────────────────────────────────────────────────────────────────
    // Splash Screen
    // ───────────────────────────────────────────────────────────────────────
    splash(title: string = "NEXNUM Core Engine") {
        if (!this.isDev || Logger.hasSplashed) return
        Logger.hasSplashed = true

        console.clear()
        process.stdout.write('\x1Bc')

        setTimeout(() => {
            console.clear()
            process.stdout.write('\x1Bc')

            console.log(`\n${C.bgBlue}${C.bold}${C.white}  ${title.toUpperCase()}  ${C.reset}\n`)
            console.log(`${C.cyan}${S.success}  Status:    ${C.green}${C.bold}READY${C.reset}`)
            console.log(`${C.cyan}${S.bolt} Server:    ${C.white}http://localhost:3000${C.reset}`)
            console.log(`${C.cyan}${S.clock}  Mode:      ${C.yellow}Development${C.reset}\n`)

            console.log(`${C.darkGray}${'─'.repeat(60)}${C.reset}`)
        }, 1500)
    }

    // ───────────────────────────────────────────────────────────────────────
    // Core Log Method (Lift-and-Drop)
    // ───────────────────────────────────────────────────────────────────────
    private log(level: string, message: string, meta?: Record<string, any>) {
        if (!this.isDev) {
            pinoLogger[level as LogLevel || 'info']({ requestId: getRequestId(), durationMs: getRequestDuration(), ...meta }, message)
            return
        }

        const minLevel = this.levelValue((process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || 'info')
        if (this.levelValue(level as LogLevel) < minLevel) return

        let symbol = S.info
        let color = C.cyan

        if (level === 'error') { symbol = S.error; color = C.red }
        else if (level === 'warn') { symbol = S.warn; color = C.yellow }
        else if (level === 'success') { symbol = S.success; color = C.green }

        const durationStr = meta?.durationMs !== undefined ? ` ${C.dim}${meta.durationMs}ms${C.reset}` : ""
        const cleanMeta = meta ? (() => { const { durationMs, ...rest } = meta; return Object.keys(rest).length > 0 ? rest : undefined })() : undefined
        const metaStr = cleanMeta ? ` ${C.dim}${JSON.stringify(cleanMeta)}${C.reset}` : ""

        // Lift dashboard (erase line)
        this.liftDashboard()

        // Print log
        console.log(`${C.gray}${this.ts()}${C.reset} ${color}${symbol}${C.reset} ${message}${durationStr}${metaStr}`)

        // Drop dashboard (reprint line)
        this.dropDashboard()
    }

    // ───────────────────────────────────────────────────────────────────────
    // Dashboard Rendering Logic
    // ───────────────────────────────────────────────────────────────────────
    private generateDashboardLine(reports: string[]): string {
        const timestampLine = reports[0] || ''
        const timeMatch = timestampLine.match(/\[(.*?)\]/)
        const successMatch = timestampLine.includes('SUCCESS')
        const durationMatch = timestampLine.match(/in \x1b\[34m(\d+ms)\x1b\[0m/)

        const time = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString()
        const status = successMatch ? `${C.green}SUCCESS${C.reset}` : `${C.red}ERROR${C.reset}`
        const duration = durationMatch ? `${C.bold}${C.blue}${durationMatch[1]}${C.reset}` : ''

        const getCount = (line: string) => {
            if (!line) return '0'
            const match = line.match(/:.*?\x1b\[0m\s*(\d+)/)
            if (!match) return '0'
            return match[1]
        }

        const inbox = getCount(reports[2])
        const outbox = getCount(reports[3])
        const push = getCount(reports[4])
        const cleanup = getCount(reports[5])

        const B = C.darkGray
        const R = C.reset // Restored missing alias

        // Format: [Time] ⚡  MASTER    Cycle Completed › 100ms › 📦 0 › 📤 0 ...
        const icon = successMatch ? S.bolt : S.error // Use bolt like 'API REQ'
        const statusColor = successMatch ? C.green : C.red
        // Pad to ensure alignment with "API REQ " (8 chars)
        const tag = `${statusColor}${successMatch ? "SUCCESS " : "ERROR   "}${R}`

        // Match Mock API: [18:50:27] ⚡  API REQ   getStatus › GET › 0ms
        // Dashboard:      [21:21:20] ⚡  SUCCESS   Master Worker › 707ms › 📦 0 › 📤 0 ...

        const line = `${C.gray}[${time}]${R} ${C.blue}${icon}${R}  ${C.bold}${tag}${R}   ${C.white}Master Worker${R} ${C.gray}›${R} ${duration} ${C.gray}›${R} 📦 ${inbox} ${C.gray}›${R} 📤 ${outbox} ${C.gray}›${R} 🔔 ${push} ${C.gray}›${R} 🧹 ${cleanup}`

        //const sep = `${C.darkGray}────────────────────────────────────────────────────────────${C.reset}`
        return `\n\n${line}`
    }

    private liftDashboard() {
        if (this.dashboardActive) {
            process.stdout.write('\x1b[3A\x1b[J') // Up 3 lines (Sep, Line, Sep), clear down
            this.dashboardActive = false
        }
    }

    private dropDashboard() {
        if (this.cachedReports.length > 0) {
            const line = this.generateDashboardLine(this.cachedReports)
            process.stdout.write(line + '\n')
            this.dashboardActive = true
        }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Public Dashboard API
    // ───────────────────────────────────────────────────────────────────────
    drawDashboard(label: string, reports: string[]) {
        if (!this.isDev) return

        this.cachedReports = reports

        // If already active, overwrite in-place (Lift + New Drop)
        this.liftDashboard()
        this.dropDashboard()
    }

    // ───────────────────────────────────────────────────────────────────────
    // Stdout Interception (The "Nuclear Option" for Stability)
    // ───────────────────────────────────────────────────────────────────────
    constructor() {
        if (this.isDev && process.env.NEXT_RUNTIME === 'nodejs') {
            this.hookStdout()
        }
    }

    private hookStdout() {
        const originalWrite = process.stdout.write.bind(process.stdout)

        // @ts-ignore
        process.stdout.write = (chunk: any, encoding?: any, cb?: any) => {
            // Prevent infinite loops if we write ourselves
            if (this.dashboardActive) {
                // Verify if this chunk is OUR dashboard to avoid recursion logic
                // Only "external" logs should trigger the lift
                const str = String(chunk)
                if (!str.includes('Master Worker')) {
                    // External log coming in! Lift dashboard.
                    process.stdout.write = originalWrite // Temporarily restore to avoid recursion during lift
                    this.liftDashboard()

                    // Write the external log
                    const result = originalWrite(chunk, encoding, cb)

                    // Restore hook and Drop dashboard
                    this.dropDashboard()
                    // Re-hook happens because dropDashboard sets dashboardActive=true, 
                    // but we need to ensure process.stdout.write IS our hook again?
                    // No, we restored originalWrite above. We need to re-assign.
                    this.hookStdout()
                    return result
                }
            }
            return originalWrite(chunk, encoding, cb)
        }
    }

    // ───────────────────────────────────────────────────────────────────────
    // Public API
    // ───────────────────────────────────────────────────────────────────────
    info(message: string, meta?: Record<string, any>) { this.log('info', message, meta) }
    success(message: string, meta?: Record<string, any>) { this.log('success', message, meta) }
    warn(message: string, meta?: Record<string, any>) { this.log('warn', message, meta) }
    error(message: string, meta?: Record<string, any>) { this.log('error', message, meta) }
    debug(message: string, meta?: Record<string, any>) { this.log('debug', message, meta) }

    divider() {
        if (!this.isDev) return
        this.liftDashboard()
        console.log(`${C.darkGray}${'─'.repeat(60)}${C.reset}`)
        this.dropDashboard()
    }

    async group<T>(label: string, cb: () => Promise<T>): Promise<T> {
        if (!this.isDev) return cb()
        this.divider()
        this.liftDashboard()
        console.log(`${C.steel}${S.box}${C.reset} ${C.bold}${label.toUpperCase()}${C.reset}`)
        this.dropDashboard()
        this.divider()
        try { return await cb() } finally { this.divider() }
    }

    request(_label: string, _method: string, _path: string, _meta?: Record<string, any>) { }
    response(_label: string, _method: string, _path: string, _status: number, _meta?: Record<string, any>) { }
}

export const logger = new Logger()
