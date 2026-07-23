/**
 * /api/alerts/slack route tests
 *
 * Verifies the Alertmanager webhook receiver correctly:
 *  - Authenticates with ALERT_WEBHOOK_SECRET
 *  - Parses Alertmanager payload
 *  - Dispatches to notificationManager.alert with the right severity
 *  - Returns 200 with processed count
 *  - Rejects on bad auth
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const alertSpy = vi.fn(async () => {})
vi.mock('@/lib/notifications/manager', () => ({
    notificationManager: { alert: alertSpy }
}))

const ORIGINAL_ENV = { ...process.env }

describe('/api/alerts/slack', () => {
    beforeEach(() => {
        vi.resetModules()
        alertSpy.mockClear()
        process.env.ALERT_WEBHOOK_SECRET = 'super-secret-12345'
    })

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV }
    })

    const makeRequest = (body: any, authHeader = 'Bearer super-secret-12345') => {
        return {
            headers: {
                get: (name: string) => (name === 'authorization' ? authHeader : null)
            },
            json: async () => body
        } as any
    }

    it('returns 200 and dispatches for a firing critical alert', async () => {
        const { POST } = await import('./route')
        const body = {
            status: 'firing',
            receiver: 'ops-pagerduty',
            commonLabels: { alertname: 'TestAlert', severity: 'critical' },
            alerts: [
                {
                    status: 'firing',
                    labels: { alertname: 'TestAlert' },
                    annotations: { summary: 'Something bad' }
                }
            ]
        }
        const res = await POST(makeRequest(body))
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.processed).toBe(1)
        expect(alertSpy).toHaveBeenCalledWith('TestAlert', expect.any(String), 'critical')
    })

    it('returns 401 on bad auth', async () => {
        const { POST } = await import('./route')
        const res = await POST(makeRequest({}, 'Bearer wrong-token'))
        expect(res.status).toBe(401)
        expect(alertSpy).not.toHaveBeenCalled()
    })

    it('returns 200 with processed=0 for empty alerts', async () => {
        const { POST } = await import('./route')
        const body = {
            status: 'firing',
            receiver: 'x',
            commonLabels: { alertname: 'X', severity: 'warning' },
            alerts: []
        }
        const res = await POST(makeRequest(body))
        const json = await res.json()
        expect(json.processed).toBe(0)
        expect(alertSpy).toHaveBeenCalledWith('X', expect.any(String), 'warning')
    })

    it('returns 500 on malformed JSON', async () => {
        const { POST } = await import('./route')
        const req = {
            headers: { get: () => 'Bearer super-secret-12345' },
            json: async () => { throw new Error('bad json') }
        } as any
        const res = await POST(req)
        expect(res.status).toBe(500)
    })

    it('healthcheck GET returns 200', async () => {
        const { GET } = await import('./route')
        const res = await GET()
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.status).toBe('ok')
    })
})
