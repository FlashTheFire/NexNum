import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { WebhookService } from '@/lib/webhooks/webhook-service'
import { z } from 'zod'

// Schema for creating webhook
const createWebhookSchema = z.object({
    url: z.string().url('Invalid URL format').startsWith('https://', 'URL must be HTTPS'),
    events: z.array(z.string()).min(1, 'At least one event type is required')
})

import { authenticateApiKey } from '@/lib/api/api-middleware'

export const GET = apiHandler(async (req) => {
    // Authenticate
    const auth = await authenticateApiKey(req as any) // Cast for api-middleware compat if needed, or just Request
    if (!auth.success) return auth.error!

    const webhooks = await WebhookService.list(auth.context!.userId)

    return NextResponse.json({
        success: true,
        data: webhooks
    })
}, {
    rateLimit: 'api'
})

export const POST = apiHandler(async (req, { body }) => {
    // Authenticate
    const auth = await authenticateApiKey(req as any)
    if (!auth.success) return auth.error!

    // Body validated by schema below
    const webhook = await WebhookService.create({
        userId: auth.context!.userId,
        url: body!.url,
        events: body!.events
    })

    return NextResponse.json({
        success: true,
        data: webhook
    }, { status: 201 })
}, {
    schema: createWebhookSchema,
    rateLimit: 'api'
})
