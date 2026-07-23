/**
 * NotificationManager routing tests
 *
 * Verifies that the manager fans out to all 4 channels (telegram, email,
 * slack, pagerduty) in parallel and isolates per-channel failures.
 *
 * Strategy: stub each channel with a no-op stub via vi.mock, call manager.notify,
 * and assert each stub was invoked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const telegramStub = { send: vi.fn(async () => true), name: 'telegram' }
const emailStub = { send: vi.fn(async () => true), name: 'email' }
const slackStub = { send: vi.fn(async () => true), name: 'slack' }
const pagerdutyStub = { send: vi.fn(async () => true), name: 'pagerduty' }

vi.mock('./channels/telegram', () => ({
    TelegramService: class { send = telegramStub.send }
}))
vi.mock('./channels/email', () => ({
    EmailService: class { send = emailStub.send }
}))
vi.mock('./channels/slack', () => ({
    SlackService: class { send = slackStub.send }
}))
vi.mock('./channels/pagerduty', () => ({
    PagerDutyService: class { send = pagerdutyStub.send }
}))

const alertPayload = {
    type: 'ALERT' as const,
    userId: 'system',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    title: 'ManagerTestAlert',
    message: 'hello',
    severity: 'critical' as const
}

const orderPayload = {
    type: 'ORDER' as const,
    userId: 'u-1',
    timestamp: new Date(),
    orderId: 'o-1',
    appName: 'TestApp',
    price: 10,
    country: 'US',
    countryCode: 'US',
    region: 'na',
    phoneNumber: '555',
    status: 'PENDING' as const
}

describe('NotificationManager fan-out', () => {
    beforeEach(() => {
        telegramStub.send.mockClear()
        emailStub.send.mockClear()
        slackStub.send.mockClear()
        pagerdutyStub.send.mockClear()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('invokes all 4 channels for an ALERT payload', async () => {
        const { notificationManager } = await import('./manager')
        await notificationManager.notify(alertPayload)
        // allow microtask queue to drain (notify is fire-and-forget via Promise.allSettled)
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(telegramStub.send).toHaveBeenCalledWith(alertPayload)
        expect(emailStub.send).toHaveBeenCalledWith(alertPayload)
        expect(slackStub.send).toHaveBeenCalledWith(alertPayload)
        expect(pagerdutyStub.send).toHaveBeenCalledWith(alertPayload)
    })

    it('invokes all 4 channels for an ORDER payload (channels self-skip)', async () => {
        const { notificationManager } = await import('./manager')
        await notificationManager.notify(orderPayload)
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(telegramStub.send).toHaveBeenCalledWith(orderPayload)
        expect(emailStub.send).toHaveBeenCalledWith(orderPayload)
        expect(slackStub.send).toHaveBeenCalledWith(orderPayload)
        expect(pagerdutyStub.send).toHaveBeenCalledWith(orderPayload)
    })

    it('isolates a channel failure (others still receive the payload)', async () => {
        telegramStub.send.mockRejectedValueOnce(new Error('Telegram down'))
        const { notificationManager } = await import('./manager')
        await notificationManager.notify(alertPayload)
        await new Promise(resolve => setTimeout(resolve, 20))
        // Slack / PD / email should still have been called even though telegram rejected
        expect(slackStub.send).toHaveBeenCalledWith(alertPayload)
        expect(pagerdutyStub.send).toHaveBeenCalledWith(alertPayload)
        expect(emailStub.send).toHaveBeenCalledWith(alertPayload)
    })

    it('alert convenience method builds correct payload and routes through notify', async () => {
        const { notificationManager } = await import('./manager')
        await notificationManager.alert('TestTitle', 'TestMessage', 'warning')
        await new Promise(resolve => setTimeout(resolve, 20))
        const sent = (slackStub.send.mock.calls[0] as any)?.[0]
        expect(sent.type).toBe('ALERT')
        expect(sent.title).toBe('TestTitle')
        expect(sent.message).toBe('TestMessage')
        expect(sent.severity).toBe('warning')
        expect(sent.userId).toBe('system')
    })

    it('defaults severity to info when omitted', async () => {
        const { notificationManager } = await import('./manager')
        await notificationManager.alert('T', 'M')
        await new Promise(resolve => setTimeout(resolve, 20))
        const sent = (slackStub.send.mock.calls[0] as any)?.[0]
        expect(sent.severity).toBe('info')
    })
})
