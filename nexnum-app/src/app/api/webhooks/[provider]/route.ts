/**
 * Universal Webhook Receiver API
 * 
 * Logic:
 * 1. Finds provider config in DB
 * 2. Uses DynamicProvider to verify signature
 * 3. Uses DynamicWebhookHandler to parse and process
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/core/logger'
import { prisma } from '@/lib/core/db'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { DynamicWebhookHandler } from '@/lib/webhooks/handlers/dynamic'

import { queue, QUEUES } from '@/lib/core/queue'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    const { provider: providerName } = await params

    try {
        // 1. Load provider configuration
        const config = await prisma.provider.findFirst({
            where: {
                name: {
                    equals: providerName,
                    mode: 'insensitive'
                }
            }
        })

        if (!config) {
            logger.warn('Webhook received for unknown provider', { provider: providerName })
            return NextResponse.json(
                { error: 'Provider not configured' },
                { status: 404 }
            )
        }

        // 2. Initialize Dynamic Engine
        const provider = new DynamicProvider(config)
        const handler = new DynamicWebhookHandler(provider)

        // 3. Get request data
        const body = await request.json().catch(() => ({}))
        const rawBody = JSON.stringify(body)

        const headers: Record<string, string | string[] | undefined> = {}
        request.headers.forEach((value, key) => {
            headers[key] = value
        })

        const ip = request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown'

        // 4. Verify Signature
        const verification = provider.verifyWebhook(rawBody, headers, ip)

        if (!verification.valid) {
            logger.warn('Webhook signature verification failed', {
                provider: providerName,
                error: verification.error,
                ip
            })
            return NextResponse.json(
                { error: 'Unauthorized', detail: verification.error },
                { status: 401 }
            )
        }

        // 5. Parse Payload
        const payload = handler.parse(body)

        logger.info('Webhook received and verified', {
            provider: providerName,
            activationId: payload.activationId,
            eventType: payload.eventType,
        })

        // 6. Enqueue for Async Processing
        await queue.publish(QUEUES.WEBHOOK_PROCESSING, {
            provider: providerName,
            payload
        })

        // 7. Success Response
        return NextResponse.json({ success: true, status: 'enqueued' }, { status: 200 })

    } catch (error: any) {
        logger.error('Webhook endpoint error', {
            provider: providerName,
            error: error.message,
            stack: error.stack,
        })

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
