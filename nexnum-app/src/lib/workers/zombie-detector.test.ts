import { describe, it, expect } from 'vitest'
import {
    ZombieDetector,
    STANDARD_WORKERS,
    type WorkerSpec,
    type HeartbeatMap
} from './zombie-detector'

function spec(overrides: Partial<WorkerSpec> = {}): WorkerSpec {
    return {
        name: 'test_worker',
        thresholdMs: 60_000,
        severity: 'warning',
        description: 'test',
        ...overrides
    }
}

describe('ZombieDetector — constructor validation', () => {
    it('rejects empty worker list', () => {
        expect(() => new ZombieDetector([])).toThrow(/at least one worker/i)
    })

    it('rejects duplicate worker names', () => {
        expect(() => new ZombieDetector([spec({ name: 'a' }), spec({ name: 'a' })])).toThrow(/duplicate/i)
    })

    it('rejects empty name', () => {
        expect(() => new ZombieDetector([spec({ name: '' })])).toThrow(/name is required/i)
    })

    it('rejects non-positive threshold', () => {
        expect(() => new ZombieDetector([spec({ thresholdMs: 0 })])).toThrow(/threshold/i)
        expect(() => new ZombieDetector([spec({ thresholdMs: -100 })])).toThrow(/threshold/i)
    })

    it('accepts a single valid worker', () => {
        expect(() => new ZombieDetector([spec()])).not.toThrow()
    })
})

describe('ZombieDetector.detect', () => {
    const w1 = spec({ name: 'w1', thresholdMs: 60_000 })
    const w2 = spec({ name: 'w2', thresholdMs: 30_000 })
    const detector = new ZombieDetector([w1, w2])

    it('returns no zombies when all heartbeats are fresh', () => {
        const now = 1_000_000
        const heartbeats: HeartbeatMap = {
            w1: now - 1_000,
            w2: now - 500
        }
        const zombies = detector.detect(heartbeats, now)
        expect(zombies).toEqual([])
    })

    it('flags a worker whose age exceeds its threshold', () => {
        const now = 1_000_000
        const heartbeats: HeartbeatMap = {
            w1: now - 90_000, // 90s > 60s threshold
            w2: now - 100
        }
        const zombies = detector.detect(heartbeats, now)
        expect(zombies).toHaveLength(1)
        expect(zombies[0]!.worker.name).toBe('w1')
        expect(zombies[0]!.ageMs).toBe(90_000)
        expect(zombies[0]!.hasHeartbeat).toBe(true)
    })

    it('treats missing heartbeat as age=Infinity', () => {
        const now = 1_000_000
        const heartbeats: HeartbeatMap = { w1: now - 100 }
        const zombies = detector.detect(heartbeats, now)
        expect(zombies).toHaveLength(1)
        expect(zombies[0]!.worker.name).toBe('w2')
        expect(zombies[0]!.ageMs).toBe(Infinity)
        expect(zombies[0]!.hasHeartbeat).toBe(false)
    })

    it('treats future heartbeats as fresh (clock skew safety)', () => {
        const now = 1_000_000
        const heartbeats: HeartbeatMap = {
            w1: now + 5_000, // 5s in the future
            w2: now - 100
        }
        const zombies = detector.detect(heartbeats, now)
        expect(zombies).toEqual([])
    })

    it('returns multiple zombies when multiple workers are stale', () => {
        const now = 1_000_000
        const heartbeats: HeartbeatMap = { w1: now - 999_999 } // w1 stale
        const zombies = detector.detect(heartbeats, now)
        expect(zombies).toHaveLength(2)
        expect(zombies.map(z => z.worker.name).sort()).toEqual(['w1', 'w2'])
    })

    it('uses Date.now() as default `now`', () => {
        const before = Date.now()
        const heartbeats: HeartbeatMap = { w1: before, w2: before - 999_999 }
        const zombies = detector.detect(heartbeats)
        const after = Date.now()
        // w2 stale, w1 fresh — only w2 should appear
        expect(zombies).toHaveLength(1)
        expect(zombies[0]!.worker.name).toBe('w2')
        // age should be roughly in [after - (before-999999), before - (after-999999)]
        expect(zombies[0]!.ageMs).toBeGreaterThan(999_000)
        expect(zombies[0]!.ageMs).toBeLessThan(after - before + 999_999 + 1)
    })
})

describe('ZombieDetector.pageable', () => {
    const wCrit = spec({ name: 'critical_w', thresholdMs: 1, severity: 'critical' })
    const wWarn = spec({ name: 'warning_w', thresholdMs: 1, severity: 'warning' })
    const wInfo = spec({ name: 'info_w', thresholdMs: 1, severity: 'info' })
    const wDefault = spec({ name: 'default_w', thresholdMs: 1 }) // no severity -> default 'warning'
    const detector = new ZombieDetector([wCrit, wWarn, wInfo, wDefault])

    it('includes critical + warning by default (excludes info)', () => {
        const zombies = detector.detect({}, 1_000_000)
        const page = detector.pageable(zombies)
        const names = page.map(z => z.worker.name).sort()
        expect(names).toEqual(['critical_w', 'default_w', 'warning_w'])
    })

    it('includes all severities when ["critical","warning","info"] given', () => {
        const zombies = detector.detect({}, 1_000_000)
        const page = detector.pageable(zombies, ['critical', 'warning', 'info'])
        expect(page).toHaveLength(4)
    })

    it('includes only the requested severities', () => {
        const zombies = detector.detect({}, 1_000_000)
        const page = detector.pageable(zombies, ['critical'])
        expect(page).toHaveLength(1)
        expect(page[0]!.worker.name).toBe('critical_w')
    })
})

describe('STANDARD_WORKERS sanity', () => {
    it('has at least the 6 expected workers', () => {
        const names = STANDARD_WORKERS.map(w => w.name)
        expect(names).toContain('master_worker')
        expect(names).toContain('payment_reconcile')
        expect(names).toContain('lifecycle_cleanup')
        expect(names).toContain('search_aggregates')
        expect(names).toContain('provider_reliability')
        expect(names).toContain('scheduled_sync')
    })

    it('all thresholds are positive and unique', () => {
        const names = new Set<string>()
        for (const w of STANDARD_WORKERS) {
            expect(w.name).toBeTruthy()
            expect(w.thresholdMs).toBeGreaterThan(0)
            expect(names.has(w.name)).toBe(false)
            names.add(w.name)
        }
    })

    it('all severities are valid', () => {
        for (const w of STANDARD_WORKERS) {
            expect(['critical', 'warning', 'info']).toContain(w.severity || 'warning')
        }
    })

    it('is a usable input to ZombieDetector', () => {
        expect(() => new ZombieDetector(STANDARD_WORKERS)).not.toThrow()
    })
})
