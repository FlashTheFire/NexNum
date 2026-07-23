/**
 * PagerDutyService unit tests
 *
 * Verifies:
 *  - No-op when PAGERDUTY_ROUTING_KEY is not set
 *  - Skips non-alert payloads
 *  - Non-critical alerts are silently dropped (no PD incident)
 *  - Critical alerts POST to events.pagerduty.com/v2/enqueue
 *  - dedup_key is included so repeated alerts dedup
 *  - HTTP failures return false
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

describe('PagerDutyService', () => {
    let mockFetch: any
    let fetchCalls: Array<{ url: string; init: any }>

    beforeEach(() => {
        vi.resetModules()
        fetchCalls = []
        mockFetch = vi.fn(async (url: any, init: any) => {
            fetchCalls.push({ url: String(url), init })
            return { ok: true, status: 202, text: async () => '{"status":"success"}' }
        })
        ;(globalThis as any).fetch = mockFetch
    })

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV }
    })

    const makeAlert = (overrides: Partial<any> = {}) => ({
        type: 'ALERT' as const,
        userId: 'system',
        timestamp: new Date('2026-01-01T00:00:00Z'),
        title: 'TestAlert',
        message: 'Something happened',
        severity: 'critical' as const,
        ...overrides
    })

    it('returns false when PAGERDUTY_ROUTING_KEY is not set', async () => {
        delete process.env.PAGERDUTY_ROUTING_KEY
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        const result = await svc.send(makeAlert())
        expect(result).toBe(false)
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('skips non-alert payloads', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey123'
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        const result = await svc.send({
            type: 'DEPOSIT' as any,
            userId: 'u1',
            timestamp: new Date(),
            amount: 1,
            currency: 'USD',
            depositId: 'd1',
            paidFrom: 'UPI',
            paymentType: 'UPI',
            transactionId: 't1'
        })
        expect(result).toBe(true)
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not page on warning severity (returns true, no fetch)', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey123'
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        const result = await svc.send(makeAlert({ severity: 'warning' }))
        expect(result).toBe(true)
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not page on info severity (returns true, no fetch)', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey123'
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        const result = await svc.send(makeAlert({ severity: 'info' }))
        expect(result).toBe(true)
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('POSTs to events.pagerduty.com for critical alerts', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey-abc'
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        const result = await svc.send(makeAlert({ severity: 'critical' }))
        expect(result).toBe(true)
        expect(fetchCalls).toHaveLength(1)
        expect(fetchCalls[0].url).toBe('https://events.pagerduty.com/v2/enqueue')
        expect(fetchCalls[0].init.method).toBe('POST')
    })

    it('sends correctly-shaped PagerDuty payload', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey-abc'
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        await svc.send(makeAlert({ severity: 'critical', title: 'ProviderDown' }))
        const body = JSON.parse(fetchCalls[0].init.body)
        expect(body.routing_key).toBe('rkey-abc')
        expect(body.event_action).toBe('trigger')
        expect(body.payload.source).toBe('nexnum')
        expect(body.payload.severity).toBe('critical')
        expect(body.payload.summary).toContain('CRITICAL')
        expect(body.payload.summary).toContain('ProviderDown')
    })

    it('includes dedup_key derived from alert title', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey-abc'
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        await svc.send(makeAlert({ severity: 'critical', title: 'ProviderDown' }))
        const body = JSON.parse(fetchCalls[0].init.body)
        expect(body.dedup_key).toBe('nexnum:ProviderDown')
    })

    it('truncates very long summaries', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey-abc'
        const longMsg = 'y'.repeat(2000)
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        await svc.send(makeAlert({ severity: 'critical', message: longMsg }))
        const body = JSON.parse(fetchCalls[0].init.body)
        // summary = prefix + truncated(message, 1024) + '...'
        // The message body portion is hard-capped at 1024 chars.
        expect(body.payload.summary).toContain('y')
        expect(body.payload.summary.length).toBeLessThanOrEqual(1100)
    })

    it('returns false on non-2xx response', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey-abc'
        ;(globalThis as any).fetch = vi.fn(async () => ({
            ok: false,
            status: 400,
            text: async () => 'invalid routing key'
        }))
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        const result = await svc.send(makeAlert({ severity: 'critical' }))
        expect(result).toBe(false)
    })

    it('returns false on network error', async () => {
        process.env.PAGERDUTY_ROUTING_KEY = 'rkey-abc'
        ;(globalThis as any).fetch = vi.fn(async () => {
            throw new Error('ETIMEDOUT')
        })
        const { PagerDutyService } = await import('./pagerduty')
        const svc = new PagerDutyService()
        const result = await svc.send(makeAlert({ severity: 'critical' }))
        expect(result).toBe(false)
    })
})
