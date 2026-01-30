import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { syncAllProviders, isSyncNeeded, getLastSyncInfo } from '@/lib/providers/provider-sync'
import { logger } from '@/lib/core/logger'

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
        logger.error('Sync status error', { error, context: 'API_SYNC' })
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

        logger.info(`Manual sync triggered by user ${user.userId}`, { context: 'API_SYNC', userId: user.userId })

        // Run sync in background (don't await)
        syncAllProviders()
            .then(results => {
                logger.info('Manual sync completed', { results, context: 'API_SYNC' })
            })
            .catch(err => {
                logger.error('Manual sync failed', { error: err, context: 'API_SYNC' })
            })

        return NextResponse.json({
            success: true,
            message: 'Sync started in background',
        })

    } catch (error) {
        logger.error('Sync trigger error', { error, context: 'API_SYNC' })
        return NextResponse.json(
            { error: 'Failed to trigger sync' },
            { status: 500 }
        )
    }
}
