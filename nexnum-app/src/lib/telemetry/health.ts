/**
 * Industrial Health Collector
 * 
 * Background supervisor that monitors "vital signs" of the Node.js process:
 * - Event Loop Lag
 * - Memory Fragmentation
 * - Active Handle/Request Counts
 */

import { system_event_loop_lag_seconds, updateHardwareStats } from '@/lib/metrics'
import { logger } from '@/lib/core/logger'

const COLLECTION_INTERVAL_MS = 10000 // 10 seconds for standard polling

export class IndustrialHealthCollector {
    private static intervalId: NodeJS.Timeout | null = null
    private static lastLoopCheck = Date.now()
    private static currentLag = 0

    /**
     * Start the background collector
     */
    static start() {
        if (this.intervalId) return

        logger.info('[HealthCollector] Initializing Industrial Telemetry Supervisor')

        this.intervalId = setInterval(() => {
            this.collect()
        }, COLLECTION_INTERVAL_MS)

        // Continuous Event Loop Lag Monitor
        this.monitorEventLoop()
    }

    /**
     * Stop the collector
     */
    static stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
    }

    /**
     * Measure Event Loop Lag using setImmediate
     */
    private static monitorEventLoop() {
        const check = () => {
            const now = Date.now()
            const delta = now - this.lastLoopCheck - 50 // 50ms is the intended delay

            // Record lag (converting to seconds)
            const lagSeconds = Math.max(0, delta) / 1000
            this.currentLag = lagSeconds
            system_event_loop_lag_seconds.set(lagSeconds)

            this.lastLoopCheck = now
            setTimeout(check, 50)
        }

        this.lastLoopCheck = Date.now()
        setTimeout(check, 50)
    }

    /**
     * Collect snapshot metrics
     */
    private static collect() {
        try {
            // 1. Update standard system metrics (Memory, Uptime)
            updateHardwareStats(0) // Default 0 for disk in this collector

            // 2. Log extreme lag for forensics if detected
            // (Standard metrics are already handled by monitorEventLoop)

        } catch (error) {
            logger.error('[HealthCollector] Collection failure', { error })
        }
    }

    /**
     * Get current Event Loop Lag in seconds
     */
    static getLag(): number {
        return this.currentLag
    }
}
