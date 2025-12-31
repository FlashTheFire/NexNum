import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/jwt'
import { syncAllProviders, isSyncNeeded, getLastSyncInfo } from '@/lib/provider-sync'

// GET - Get sync status and info
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        // For now, allow unauthenticated access to sync status
        // In production, you'd want to restrict this to admins

        const needsSync = await isSyncNeeded()
        const syncInfo = await getLastSyncInfo()

        return NextResponse.json({
            success: true,
            needsSync,
            ...syncInfo,
        })

    } catch (error) {
        console.error('Sync status error:', error)
        return NextResponse.json(
            { error: 'Failed to get sync status' },
            { status: 500 }
        )
    }
}

// POST - Trigger manual sync
export async function POST(request: Request) {
    try {
        // In production, verify admin role
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        console.log(`[SYNC] Manual sync triggered by user ${user.userId}`)

        // Run sync in background (don't await)
        syncAllProviders()
            .then(results => {
                console.log('[SYNC] Manual sync completed:', results)
            })
            .catch(err => {
                console.error('[SYNC] Manual sync failed:', err)
            })

        return NextResponse.json({
            success: true,
            message: 'Sync started in background',
        })

    } catch (error) {
        console.error('Sync trigger error:', error)
        return NextResponse.json(
            { error: 'Failed to trigger sync' },
            { status: 500 }
        )
    }
}
