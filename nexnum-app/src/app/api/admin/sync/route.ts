import { NextResponse } from 'next/server'
import { syncProviderData } from '@/lib/providers/provider-sync'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'

export async function POST(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        let provider: string | undefined

        try {
            const body = await request.json()
            provider = body.provider
        } catch (e) {
            // Body is optional, proceed with undefined provider
        }

        let result
        if (provider) {
            console.log(`[API] Starting Admin Sync for provider: ${provider}...`)
            result = await syncProviderData(provider)
        } else {
            console.log(`[API] Starting Full Admin Sync (all providers)...`)
            // Import syncAllProviders dynamically or ensure it's imported at top
            const { syncAllProviders } = await import('@/lib/providers/provider-sync')
            result = await syncAllProviders()
        }

        // Audit log the sync action
        await logAdminAction({
            userId: auth.userId,
            action: 'SYNC_TRIGGERED',
            resourceType: 'Provider',
            resourceId: provider || 'ALL',
            metadata: { stats: result },
            ipAddress: getClientIP(request)
        })

        return NextResponse.json({
            success: true,
            message: provider ? `Sync completed for ${provider}` : `Full sync completed`,
            stats: result
        })

    } catch (error) {
        console.error("Sync Error:", error)
        return NextResponse.json({ error: 'Sync failed: ' + (error as Error).message }, { status: 500 })
    }
}

