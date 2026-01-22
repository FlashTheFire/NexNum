import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { WebhookService } from '@/lib/webhooks/webhook-service'
import { authenticateApiKey } from '@/lib/api/api-middleware'
import { z } from 'zod'

// Schema for updating webhook
const updateWebhookSchema = z.object({
    url: z.string().url().optional(),
    events: z.array(z.string()).min(1).optional(),
    isActive: z.boolean().optional()
})

// GET /api/v1/webhooks/[id]
export const GET = apiHandler(async (req, { params }) => {
    const auth = await authenticateApiKey(req as any)
    if (!auth.success) return auth.error!

    const webhook = await WebhookService.get(params.id, auth.context!.userId)

    if (!webhook) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }

    return NextResponse.json({
        success: true,
        data: webhook
    })
}, { rateLimit: 'api' })

// DELETE /api/v1/webhooks/[id]
export const DELETE = apiHandler(async (req, { params }) => {
    const auth = await authenticateApiKey(req as any)
    if (!auth.success) return auth.error!

    try {
        await WebhookService.delete(params.id, auth.context!.userId)
        return NextResponse.json({ success: true })
    } catch (e) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }
}, { rateLimit: 'api' })

// PATCH /api/v1/webhooks/[id]
export const PATCH = apiHandler(async (req, { params, body }) => {
    const auth = await authenticateApiKey(req as any)
    if (!auth.success) return auth.error!

    try {
        const updated = await WebhookService.update(params.id, auth.context!.userId, body!)
        return NextResponse.json({
            success: true,
            data: updated
        })
    } catch (e) {
        return NextResponse.json({ error: 'Webhook not found' }, { status: 404 })
    }
}, {
    schema: updateWebhookSchema,
    rateLimit: 'api'
})
