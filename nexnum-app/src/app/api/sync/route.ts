import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import { isSyncNeeded, getLastSyncInfo } from '@/lib/providers/provider-sync'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { queue, QUEUES } from '@/lib/core/queue'

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
    console.error('Sync status error', error)
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    )
  }
}

// POST - Trigger manual sync via PgBoss queue (supports unauthenticated cron via x-cron-secret header)
export async function POST(request: Request) {
  try {
    // Allow unauthenticated cron calls via secret header, otherwise require admin
    const cronSecret = process.env.SYNC_SECRET
    const isCron = cronSecret && request.headers.get('x-cron-secret') === cronSecret

    let user: { userId: string } | null = null
    if (!isCron) {
      const auth = await AuthGuard.requireAdmin()
      if (auth.error) return auth.error
      user = auth.user
    }

    const jobId = await queue.publish(QUEUES.PROVIDER_SYNC, {})

    if (user) {
      await logAdminAction({
        userId: user.userId,
        action: 'SYNC_TRIGGERED',
        resourceType: 'Provider',
        resourceId: 'ALL',
        metadata: { jobId, status: 'queued' },
        ipAddress: getClientIP(request),
      })
    }

    return NextResponse.json({
      success: true,
      message: `Sync queued successfully (Job ID: ${jobId})`,
      jobId,
    })

  } catch (error) {
    console.error('Sync trigger error', error)
    return NextResponse.json(
      { error: 'Failed to trigger sync: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
