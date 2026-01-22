import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebhookService } from '@/lib/webhooks/webhook-service'

// Mock Prisma
const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        webhook: {
            create: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            delete: vi.fn()
        },
        webhookDelivery: {
            create: vi.fn()
        }
    }
}))

vi.mock('@/lib/core/db', () => ({
    prisma: mockPrisma
}))

describe('WebhookService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('create', () => {
        it('should create webhook with secret', async () => {
            mockPrisma.webhook.create.mockResolvedValue({
                id: 'w1',
                secret: 'generated_secret'
            } as any)

            const result = await WebhookService.create({
                userId: 'u1',
                url: 'https://example.com/hook',
                events: ['sms.received']
            })

            expect(mockPrisma.webhook.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    userId: 'u1',
                    url: 'https://example.com/hook',
                    isActive: true
                })
            }))
            expect(result.secret).toBe('generated_secret')
        })
    })

    describe('dispatch', () => {
        it('should create deliveries for active webhooks', async () => {
            // Mock finding active webhooks
            mockPrisma.webhook.findMany.mockResolvedValue([
                { id: 'w1', url: 'https://a.com' },
                { id: 'w2', url: 'https://b.com' }
            ] as any)

            await WebhookService.dispatch('u1', 'sms.received', { foo: 'bar' })

            expect(mockPrisma.webhook.findMany).toHaveBeenCalledWith({
                where: {
                    userId: 'u1',
                    isActive: true,
                    events: { has: 'sms.received' }
                }
            })

            // Should create 2 deliveries
            expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledTimes(2)
            expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    webhookId: 'w1',
                    event: 'sms.received',
                    status: 'pending'
                })
            }))
        })

        it('should do nothing if no matching webhooks', async () => {
            mockPrisma.webhook.findMany.mockResolvedValue([])

            await WebhookService.dispatch('u1', 'sms.received', {})

            expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled()
        })
    })
})
