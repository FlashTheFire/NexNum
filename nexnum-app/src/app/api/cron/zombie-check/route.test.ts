import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the notification manager BEFORE importing the route
vi.mock('@/lib/notifications/manager', () => ({
    notificationManager: {
        alert: vi.fn(async () => true)
    }
}))

import { POST } from './route'
import { notificationManager } from '@/lib/notifications/manager'
import { _resetForTests as resetRegistry, recordHeartbeat as realRecord } from '@/lib/workers/heartbeat-registry'

function makeReq(auth?: string): Request {
    const headers: Record<string, string> = {}
    if (auth) headers['authorization'] = auth
    return new Request('http://localhost/api/cron/zombie-check', {
        method: 'POST',
        headers
    })
}

describe('POST /api/cron/zombie-check', () => {
    beforeEach(() => {
        resetRegistry()
        vi.clearAllMocks()
        delete process.env.CRON_SECRET
    })

    it('returns 200 with healthy payload when all heartbeats fresh', async () => {
        // Make all standard workers fresh by recording "now"
        const { STANDARD_WORKERS } = await import('@/lib/workers/zombie-detector')
        for (const w of STANDARD_WORKERS) realRecord(w.name)
        const res = await POST(makeReq() as any)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.zombies).toEqual([])
        expect(body.monitoredWorkers.length).toBe(STANDARD_WORKERS.length)
        expect(notificationManager.alert).not.toHaveBeenCalled()
    })

    it('returns 207 with zombie payload + calls alert() when critical zombie', async () => {
        // Wipe all heartbeats -> every worker is a zombie
        resetRegistry()
        const res = await POST(makeReq() as any)
        // Some are critical (master_worker, payment_reconcile), so expect 207
        expect(res.status).toBe(207)
        const body = await res.json()
        expect(body.zombies.length).toBeGreaterThan(0)
        expect(body.alerted.length).toBeGreaterThan(0)
        expect(notificationManager.alert).toHaveBeenCalled()
        // at least one call with severity=critical
        const calls = (notificationManager.alert as any).mock.calls as Array<[string, string, string]>
        const severities = calls.map(c => c[2])
        expect(severities).toContain('critical')
    })

    it('returns 401 when CRON_SECRET mismatched', async () => {
        process.env.CRON_SECRET = 'real-secret'
        const res = await POST(makeReq('Bearer wrong') as any)
        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'Unauthorized' })
    })

    it('accepts the correct CRON_SECRET', async () => {
        process.env.CRON_SECRET = 'real-secret'
        const res = await POST(makeReq('Bearer real-secret') as any)
        // 200 or 207 — both are valid auth-passed outcomes
        expect([200, 207]).toContain(res.status)
    })

    it('skips auth when CRON_SECRET is unset (dev mode)', async () => {
        delete process.env.CRON_SECRET
        const res = await POST(makeReq() as any)
        expect([200, 207]).toContain(res.status)
    })

    it('response includes monitoredWorkers and heartbeats fields', async () => {
        const res = await POST(makeReq() as any)
        const body = await res.json()
        expect(body.monitoredWorkers).toBeDefined()
        expect(Array.isArray(body.monitoredWorkers)).toBe(true)
        expect(body.heartbeats).toBeDefined()
        expect(typeof body.heartbeats).toBe('object')
        expect(body.checked).toBeGreaterThan(0)
        expect(typeof body.timestamp).toBe('string')
        expect(typeof body.pruned).toBe('number')
    })
})
