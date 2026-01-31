
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { syncProviderData } from '@/lib/providers/provider-sync'
import { AuthGuard } from '@/lib/auth/guard'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { currencyService } from '@/lib/currency/currency-service'
import { refreshAllServiceAggregates } from '@/lib/search/service-aggregates'
import { logger } from '@/lib/core/logger'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const provider = await prisma.provider.findUnique({ where: { id } })
        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        logger.info(`Queueing manual sync for ${provider.name}`, { context: 'SYNC_MANUAL', adminId: auth.user.userId })

        // 1. Sync Exchange Rates (Ensure margins are accurate)
        try {
            await currencyService.syncRates()
        } catch (e) {
            logger.warn('Rate sync warning during manual provider sync', { error: (e as any).message })
        }

        // 2. Queue the Provider Sync Job
        const { queue, QUEUES } = await import('@/lib/core/queue')
        const jobId = await queue.publish(QUEUES.PROVIDER_SYNC, { provider: provider.name })

        // Audit log the sync trigger
        await logAdminAction({
            userId: auth.user.userId,
            action: 'SYNC_TRIGGERED',
            resourceType: 'Provider',
            resourceId: id,
            metadata: { providerName: provider.name, jobId, status: 'queued' },
            ipAddress: getClientIP(req)
        })

        return NextResponse.json({
            success: true,
            message: `Synchronization for ${provider.displayName} has been queued.`,
            jobId
        })
    } catch (error: any) {
        console.error('Sync trigger failed:', error)
        return NextResponse.json({ error: error.message || 'Sync failed to queue' }, { status: 500 })
    }
}
