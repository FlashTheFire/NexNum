/**
 * SlackService unit tests
 *
 * Verifies:
 *  - No-op when env not configured
 *  - Skips non-alert payloads
 *  - Critical uses SLACK_CRITICAL_WEBHOOK_URL if set, else falls back
 *  - Non-critical uses SLACK_WEBHOOK_URL
 *  - Severity drives emoji/colour
 *  - HTTP failures return false (don't throw)
 *  - Long messages are truncated
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Hoisted mutable env snapshot
const ORIGINAL_ENV = { ...process.env }

describe('SlackService', () => {
    let mockFetch: any
    let fetchCalls: Array<{ url: string; init: any }>

    beforeEach(() => {
        vi.resetModules()
        fetchCalls = []
        mockFetch = vi.fn(async (url: any, init: any) => {
            fetchCalls.push({ url: String(url), init })
            return { ok: true, status: 200, text: async () => 'ok' }
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
        severity: 'warning' as const,
        ...overrides
    })

    it('returns false when SLACK_WEBHOOK_URL is not set', async () => {
        delete process.env.SLACK_WEBHOOK_URL
        delete process.env.SLACK_CRITICAL_WEBHOOK_URL
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
        const result = await svc.send(makeAlert())
        expect(result).toBe(false)
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('skips non-alert payloads (returns true silently)', async () => {
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/AAA/BBB/CCC'
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
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

    it('uses SLACK_WEBHOOK_URL for warning severity', async () => {
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/warn'
        delete process.env.SLACK_CRITICAL_WEBHOOK_URL
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
        const result = await svc.send(makeAlert({ severity: 'warning' }))
        expect(result).toBe(true)
        expect(fetchCalls).toHaveLength(1)
        expect(fetchCalls[0].url).toBe('https://hooks.slack.com/services/warn')
        const body = JSON.parse(fetchCalls[0].init.body)
        expect(body.text).toContain('TestAlert')
        expect(body.attachments[0].color).toBe('#ffc107')
    })

    it('uses SLACK_CRITICAL_WEBHOOK_URL for critical severity when set', async () => {
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/warn'
        process.env.SLACK_CRITICAL_WEBHOOK_URL = 'https://hooks.slack.com/services/crit'
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
        await svc.send(makeAlert({ severity: 'critical' }))
        expect(fetchCalls[0].url).toBe('https://hooks.slack.com/services/crit')
        const body = JSON.parse(fetchCalls[0].init.body)
        expect(body.attachments[0].color).toBe('#dc3545')
        expect(body.text).toContain(':rotating_light:')
    })

    it('falls back to SLACK_WEBHOOK_URL for critical when no critical webhook', async () => {
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/warn'
        delete process.env.SLACK_CRITICAL_WEBHOOK_URL
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
        await svc.send(makeAlert({ severity: 'critical' }))
        expect(fetchCalls[0].url).toBe('https://hooks.slack.com/services/warn')
    })

    it('returns false and does not throw on non-2xx response', async () => {
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/warn'
        ;(globalThis as any).fetch = vi.fn(async () => ({
            ok: false,
            status: 500,
            text: async () => 'server error'
        }))
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
        const result = await svc.send(makeAlert())
        expect(result).toBe(false)
    })

    it('returns false and does not throw on network error', async () => {
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/warn'
        ;(globalThis as any).fetch = vi.fn(async () => {
            throw new Error('ECONNREFUSED')
        })
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
        const result = await svc.send(makeAlert())
        expect(result).toBe(false)
    })

    it('truncates very long messages to fit Slack limits', async () => {
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/warn'
        const longMsg = 'x'.repeat(5000)
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
        await svc.send(makeAlert({ message: longMsg }))
        const body = JSON.parse(fetchCalls[0].init.body)
        expect(body.attachments[0].text.length).toBeLessThanOrEqual(1900)
        expect(body.attachments[0].text).toMatch(/\.\.\.$/)
    })

    it('uses correct timestamp (epoch seconds)', async () => {
        process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/warn'
        const ts = new Date('2026-06-15T12:34:56Z')
        const { SlackService } = await import('./slack')
        const svc = new SlackService()
        await svc.send(makeAlert({ timestamp: ts }))
        const body = JSON.parse(fetchCalls[0].init.body)
        expect(body.attachments[0].ts).toBe(Math.floor(ts.getTime() / 1000))
    })
})
