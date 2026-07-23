import { describe, it, expect, beforeEach } from 'vitest'
import { recordHeartbeat, readHeartbeats, pruneStaleHeartbeats, _resetForTests } from './heartbeat-registry'

describe('heartbeat-registry', () => {
    beforeEach(() => {
        _resetForTests()
    })

    it('recordHeartbeat + readHeartbeats round-trips', () => {
        const before = Date.now()
        recordHeartbeat('w1')
        const after = Date.now()
        const all = readHeartbeats()
        expect(all.w1).toBeGreaterThanOrEqual(before)
        expect(all.w1).toBeLessThanOrEqual(after)
    })

    it('recordHeartbeat accepts a custom timestamp', () => {
        const fixed = 1_700_000_000_000
        recordHeartbeat('w1', fixed)
        expect(readHeartbeats().w1).toBe(fixed)
    })

    it('readHeartbeats returns a defensive copy', () => {
        recordHeartbeat('w1', 100)
        const snap = readHeartbeats()
        snap.w1 = 999
        snap['evil'] = 1
        // mutations to the returned object should not leak into the store
        const again = readHeartbeats()
        expect(again.w1).toBe(100)
        expect(again.evil).toBeUndefined()
    })

    it('pruneStaleHeartbeats removes entries older than maxAgeMs', () => {
        const now = Date.now()
        recordHeartbeat('fresh', now)
        recordHeartbeat('stale', now - 100_000)
        recordHeartbeat('ancient', now - 1_000_000)
        const removed = pruneStaleHeartbeats(10_000)
        const after = readHeartbeats()
        expect(removed).toBe(2)
        expect(after.fresh).toBeDefined()
        expect(after.stale).toBeUndefined()
        expect(after.ancient).toBeUndefined()
    })

    it('pruneStaleHeartbeats with Infinity keeps everything', () => {
        const now = Date.now()
        recordHeartbeat('a', now - 99_999_999)
        const removed = pruneStaleHeartbeats(Infinity)
        expect(removed).toBe(0)
        expect(readHeartbeats().a).toBeDefined()
    })

    it('_resetForTests clears the store', () => {
        recordHeartbeat('a')
        recordHeartbeat('b')
        _resetForTests()
        expect(Object.keys(readHeartbeats())).toEqual([])
    })

    it('records overwrite previous timestamps for the same worker', () => {
        recordHeartbeat('w1', 100)
        recordHeartbeat('w1', 200)
        expect(readHeartbeats().w1).toBe(200)
    })
})
