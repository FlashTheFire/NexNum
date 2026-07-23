/**
 * Worker Heartbeat Registry — In-process singleton.
 *
 * Each background worker reports a heartbeat at the end of each tick.
 * The zombie-detector cron reads the map to identify stuck workers.
 *
 * Scope: in-process / single-instance. In a multi-instance deployment
 * each instance's registry is independent; that is acceptable because
 * Docker-level health checks (`/health` on HEALTH_PORT) already
 * cover per-process liveness. This registry exists to detect *logical*
 * hangs — a worker that is alive and answering healthchecks but not
 * making progress (deadlocked, infinite retry, etc).
 *
 * If we ever move to multiple worker pods we should switch to a
 * shared store (Redis SETEX or DB table) — but doing that now would
 * over-engineer for the current single-worker deployment.
 */

type HeartbeatMap = Record<string, number>

// Use globalThis to survive HMR in dev (similar pattern to Prisma singleton).
const GLOBAL_KEY = '__nexnum_worker_heartbeats__'

interface GlobalWithRegistry {
    [GLOBAL_KEY]?: HeartbeatMap
}

function getStore(): HeartbeatMap {
    const g = globalThis as unknown as GlobalWithRegistry
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = {}
    }
    return g[GLOBAL_KEY]!
}

/**
 * Record a heartbeat for a worker at the given time
 * (defaults to now). Idempotent.
 */
export function recordHeartbeat(workerName: string, at: number = Date.now()): void {
    if (!workerName || typeof workerName !== 'string') {
        throw new Error('workerName is required')
    }
    if (typeof at !== 'number' || !Number.isFinite(at)) {
        throw new Error('at must be a finite number')
    }
    getStore()[workerName] = at
}

/**
 * Read a snapshot of all heartbeats. Returns a plain object so callers
 * can iterate without affecting the live store.
 */
export function readHeartbeats(): HeartbeatMap {
    // Defensive copy
    return { ...getStore() }
}

/**
 * Drop heartbeats older than `maxAgeMs`. Used by the cron route to
 * prevent the in-memory map from growing unbounded if workers change
 * their names over time.
 */
export function pruneStaleHeartbeats(maxAgeMs: number, now: number = Date.now()): number {
    if (typeof maxAgeMs !== 'number' || maxAgeMs <= 0) {
        throw new Error('maxAgeMs must be > 0')
    }
    const store = getStore()
    let removed = 0
    for (const [name, ts] of Object.entries(store)) {
        if (now - ts > maxAgeMs) {
            delete store[name]
            removed++
        }
    }
    return removed
}

/**
 * Test-only: clear all heartbeats. Not exported from the package index.
 */
export function _resetForTests(): void {
    const g = globalThis as unknown as GlobalWithRegistry
    g[GLOBAL_KEY] = {}
}
