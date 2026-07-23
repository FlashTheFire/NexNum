/**
 * Zombie Worker Detector — Pure Logic
 *
 * Determines which background workers are "zombie" (registered but not
 * heartbeating for longer than their individual threshold).
 *
 * Pure / dependency-free so it can be unit tested without a DB.
 *
 * Workers are NOT hardcoded — they are passed in at construction time
 * so each call site can declare its own set of monitored jobs.
 */

export interface WorkerSpec {
    /** Stable identifier for the worker (matches the heartbeat key) */
    name: string
    /** How long without a heartbeat before we consider it zombie (ms) */
    thresholdMs: number
    /** Severity routed to PagerDuty when zombie. info|warning|critical */
    severity?: 'info' | 'warning' | 'critical'
    /** Free-form description for alerts */
    description?: string
}

export interface HeartbeatMap {
    /** Map of worker name → epoch-ms when it last reported */
    [workerName: string]: number
}

export interface ZombieResult {
    worker: WorkerSpec
    /** ms since last heartbeat (Infinity if never seen) */
    ageMs: number
    /** True if a heartbeat has been recorded at all */
    hasHeartbeat: boolean
}

export class ZombieDetector {
    private readonly workers: WorkerSpec[]

    constructor(workers: WorkerSpec[]) {
        if (workers.length === 0) {
            throw new Error('ZombieDetector requires at least one worker spec')
        }
        // Reject duplicates — would silently mask detection
        const seen = new Set<string>()
        for (const w of workers) {
            if (!w.name || typeof w.name !== 'string') {
                throw new Error('Worker name is required')
            }
            if (typeof w.thresholdMs !== 'number' || w.thresholdMs <= 0) {
                throw new Error(`Worker ${w.name} thresholdMs must be > 0`)
            }
            if (seen.has(w.name)) {
                throw new Error(`Duplicate worker name: ${w.name}`)
            }
            seen.add(w.name)
        }
        this.workers = workers
    }

    /**
     * Detect zombies at the given `now` time (defaults to Date.now()).
     * Returns a list of workers that have either never heartbeated or
     * whose last heartbeat is older than their threshold.
     */
    detect(heartbeats: HeartbeatMap, now: number = Date.now()): ZombieResult[] {
        const zombies: ZombieResult[] = []
        for (const w of this.workers) {
            const last = heartbeats[w.name]
            if (last === undefined) {
                zombies.push({ worker: w, ageMs: Infinity, hasHeartbeat: false })
                continue
            }
            const age = now - last
            if (age < 0) {
                // Clock skew (heartbeat in the future) — treat as fresh,
                // but still log. We don't want a future clock to flag a
                // healthy worker as zombie.
                continue
            }
            if (age > w.thresholdMs) {
                zombies.push({ worker: w, ageMs: age, hasHeartbeat: true })
            }
        }
        return zombies
    }

    /**
     * Filter zombies down to those whose severity qualifies for paging.
     * Default: critical + warning (excludes info, which is noisy).
     * Use `severities: ['critical']` for the PagerDuty route.
     */
    pageable(zombies: ZombieResult[], severities: Array<'info' | 'warning' | 'critical'> = ['critical', 'warning']): ZombieResult[] {
        return zombies.filter(z => severities.includes((z.worker.severity || 'warning') as 'info' | 'warning' | 'critical'))
    }

    /** Inspect the configured workers (read-only) */
    get workers$(): ReadonlyArray<WorkerSpec> {
        return this.workers
    }
}

/**
 * Standard worker spec for the NexNum background workers.
 * Exposed here so the cron route, the master worker, and the test
 * all import the same source of truth.
 */
export const STANDARD_WORKERS: WorkerSpec[] = [
    {
        name: 'master_worker',
        thresholdMs: 5 * 60 * 1000, // 5 min — runs every minute
        severity: 'critical',
        description: 'Master orchestrator (outbox / push / inbox)'
    },
    {
        name: 'payment_reconcile',
        thresholdMs: 30 * 60 * 1000, // 30 min — runs every 15 min
        severity: 'critical',
        description: 'Payment reconciliation'
    },
    {
        name: 'lifecycle_cleanup',
        thresholdMs: 20 * 60 * 1000, // 20 min — runs every 10 min
        severity: 'warning',
        description: 'Reservation lifecycle cleanup'
    },
    {
        name: 'search_aggregates',
        thresholdMs: 10 * 60 * 1000, // 10 min — runs every 5 min
        severity: 'warning',
        description: 'Search aggregates refresh'
    },
    {
        name: 'provider_reliability',
        thresholdMs: 2 * 60 * 60 * 1000, // 2h — runs every hour
        severity: 'info',
        description: 'Provider reliability stats'
    },
    {
        name: 'scheduled_sync',
        thresholdMs: 26 * 60 * 60 * 1000, // 26h — runs daily at 00:00
        severity: 'info',
        description: 'Daily provider sync'
    }
]
