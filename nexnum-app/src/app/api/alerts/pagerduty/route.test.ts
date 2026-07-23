/**
 * /api/alerts/pagerduty route tests
 *
 * Verifies the PagerDuty webhook receiver:
 *  - Authenticates
 *  - Hard-rejects warning/info (no page)
 *  - Hard-rejects resolved
 *  - Dispatches to notificationManager.alert('critical') for firing critical alerts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const alertSpy = vi.fn(async () => {})
vi.mock('@/lib/notifications/manager', () => ({
    notificationManager: { alert: alertSpy }
}))

const ORIGINAL_ENV = { ...process.env }

describe('/api/alerts/pagerduty', () => {
    beforeEach(() => {
        vi.resetModules()
        alertSpy.mockClear()
        process.env.ALERT_WEBHOOK_SECRET = 'super-secret-12345'
    })

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV }
    })

    const makeRequest = (body: any, authHeader = 'Bearer super-secret-12345') => ({
        headers: {
            get: (name: string) => (name === 'authorization' ? authHeader : null)
        },
        json: async () => body
    }) as any

    it('returns 200 and dispatches for firing critical alert', async () => {
        const { POST } = await import('./route')
        const body = {
            status: 'firing',
            receiver: 'ops-pagerduty',
            commonLabels: { alertname: 'ProviderDown', severity: 'critical' },
            alerts: [
                {
                    status: 'firing',
                    labels: { alertname: 'ProviderDown' },
                    annotations: { summary: 'All calls failing' }
                }
            ]
        }
        const res = await POST(makeRequest(body))
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(alertSpy).toHaveBeenCalledWith('ProviderDown', expect.any(String), 'critical')
    })

    it('skips non-critical (warning/info) without dispatching', async () => {
        const { POST } = await import('./route')
        const body = {
            status: 'firing',
            receiver: 'x',
            commonLabels: { alertname: 'SomeWarning', severity: 'warning' },
            alerts: [{ status: 'firing', labels: {}, annotations: {} }]
        }
        const res = await POST(makeRequest(body))
        const json = await res.json()
        expect(json.skipped).toBe(true)
        expect(json.reason).toBe('non-critical')
        expect(alertSpy).not.toHaveBeenCalled()
    })

    it('skips resolved alerts', async () => {
        const { POST } = await import('./route')
        const body = {
            status: 'resolved',
            receiver: 'x',
            commonLabels: { alertname: 'ProviderDown', severity: 'critical' },
            alerts: []
        }
        const res = await POST(makeRequest(body))
        const json = await res.json()
        expect(json.skipped).toBe(true)
        expect(json.reason).toBe('resolved')
        expect(alertSpy).not.toHaveBeenCalled()
    })

    it('returns 401 on bad auth', async () => {
        const { POST } = await import('./route')
        const res = await POST(makeRequest({}, 'Bearer wrong'))
        expect(res.status).toBe(401)
    })

    it('returns 500 on parse error', async () => {
        const { POST } = await import('./route')
        const req = {
            headers: { get: () => 'Bearer super-secret-12345' },
            json: async () => { throw new Error('bad') }
        } as any
        const res = await POST(req)
        expect(res.status).toBe(500)
    })
})
