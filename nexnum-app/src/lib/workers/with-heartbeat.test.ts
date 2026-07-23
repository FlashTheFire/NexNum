import { describe, it, expect, beforeEach } from 'vitest'
import { withHeartbeat } from './with-heartbeat'
import { _resetForTests, readHeartbeats } from './heartbeat-registry'

describe('withHeartbeat', () => {
    beforeEach(() => {
        _resetForTests()
    })

    it('records a heartbeat on success and returns the function result', async () => {
        const before = Date.now()
        const wrapped = withHeartbeat('w1', async () => 'ok')
        const result = await wrapped()
        const after = Date.now()
        expect(result).toBe('ok')
        const all = readHeartbeats()
        expect(all.w1).toBeGreaterThanOrEqual(before)
        expect(all.w1).toBeLessThanOrEqual(after)
    })

    it('records a heartbeat on failure and re-throws', async () => {
        const before = Date.now()
        const wrapped = withHeartbeat('w1', async () => {
            throw new Error('boom')
        })
        await expect(wrapped()).rejects.toThrow('boom')
        const all = readHeartbeats()
        expect(all.w1).toBeGreaterThanOrEqual(before)
    })

    it('records exactly one heartbeat per invocation', async () => {
        const wrapped = withHeartbeat('w1', async () => 42)
        await wrapped()
        // Subsequent reads should return the same timestamp (no overwrite from a second call)
        const t1 = readHeartbeats().w1
        await new Promise(r => setTimeout(r, 5))
        // No second call — timestamp should be stable
        expect(readHeartbeats().w1).toBe(t1)
    })

    it('preserves the resolved value (number, object, undefined)', async () => {
        const a = withHeartbeat('a', async () => 7)
        const b = withHeartbeat('b', async () => ({ ok: true }))
        const c = withHeartbeat('c', async () => undefined)
        expect(await a()).toBe(7)
        expect(await b()).toEqual({ ok: true })
        expect(await c()).toBeUndefined()
    })
})
