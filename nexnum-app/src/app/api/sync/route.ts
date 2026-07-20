import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import { syncAllProviders, isSyncNeeded, getLastSyncInfo } from '@/lib/providers/provider-sync'
import { logger } from '@/lib/core/logger'

// GET - Get sync status and info (ADMIN ONLY)
export async function GET(request: Request) {
    try {
        const { error } = await AuthGuard.requireAdmin()
        if (error) return error

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

// POST - Trigger manual sync (ADMIN ONLY)
export async function POST(request: Request) {
    try {
        const { user, error } = await AuthGuard.requireAdmin()
        if (error) return error

        logger.info(`Manual sync triggered by admin ${user.userId}`, { context: 'API_SYNC', userId: user.userId })

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
