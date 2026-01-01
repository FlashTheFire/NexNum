import { NextResponse } from 'next/server'
import { syncProviderData } from '@/lib/provider-sync'
import { requireAdmin } from '@/lib/requireAdmin'
import { logAdminAction, getClientIP } from '@/lib/auditLog'

export async function POST(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { provider } = body

        if (!provider) {
            return NextResponse.json({ error: 'Provider required' }, { status: 400 })
        }

        console.log(`Starting Admin Sync for ${provider}...`)

        const result = await syncProviderData(provider)

        // Audit log the sync action
        await logAdminAction({
            userId: auth.userId,
            action: 'SYNC_TRIGGERED',
            resourceType: 'Provider',
            resourceId: provider,
            metadata: { stats: result },
            ipAddress: getClientIP(request)
        })

        return NextResponse.json({
            success: true,
            message: `Sync completed for ${provider}`,
            stats: result
        })

    } catch (error) {
        console.error("Sync Error:", error)
        return NextResponse.json({ error: 'Sync failed: ' + (error as Error).message }, { status: 500 })
    }
}

