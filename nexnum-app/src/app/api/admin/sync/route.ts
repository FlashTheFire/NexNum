import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { queue, QUEUES } from '@/lib/core/queue'

export async function POST(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        let provider: string | undefined

        try {
            const body = await request.json()
            provider = body.provider
        } catch (e) {
            // Body is optional
        }

        console.log(`[API] Queueing Admin Sync for: ${provider || 'ALL'}...`)

        const jobId = await queue.publish(QUEUES.PROVIDER_SYNC, { provider })

        // Audit log the sync action
        await logAdminAction({
            userId: auth.userId,
            action: 'SYNC_TRIGGERED',
            resourceType: 'Provider',
            resourceId: provider || 'ALL',
            metadata: { jobId, status: 'queued' },
            ipAddress: getClientIP(request)
        })

        return NextResponse.json({
            success: true,
            message: `Sync queued successfully (Job ID: ${jobId})`,
            jobId
        })

    } catch (error) {
        console.error("Sync Error:", error)
        return NextResponse.json({ error: 'Sync trigger failed: ' + (error as Error).message }, { status: 500 })
    }
}

