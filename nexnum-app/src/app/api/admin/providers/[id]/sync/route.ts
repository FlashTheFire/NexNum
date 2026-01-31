
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

        logger.info(`Starting manual sync for ${provider.name}`, { context: 'SYNC_MANUAL', adminId: auth.user.userId })

        // 1. Sync Exchange Rates (Ensure margins are accurate)
        try {
            await currencyService.syncRates()
        } catch (e) {
            logger.warn('Rate sync warning during manual provider sync', { error: (e as any).message })
        }

        // 2. Perform the Provider Sync
        const result = await syncProviderData(provider.name)

        // 3. Post-Sync Cleanup: Refresh Aggregates (Critical for UI lists)
        try {
            await refreshAllServiceAggregates()
        } catch (e) {
            logger.error('Failed to refresh aggregates after manual sync', { error: (e as any).message })
        }

        // 4. Icon Sync (Best effort)
        try {
            const { ProviderIconManager } = await import('@/lib/providers/icon-manager')
            const iconManager = new ProviderIconManager()
            // We can't easily sync "just this provider's icons" without checking all services,
            // so we'll run the standard sync which is fairly efficient.
            await iconManager.syncAllProviders()
        } catch (e) {
            logger.warn('Icon sync warning', { error: (e as any).message })
        }

        // Audit log the sync
        await logAdminAction({
            userId: auth.user.userId,
            action: 'SYNC_TRIGGERED',
            resourceType: 'Provider',
            resourceId: id,
            metadata: { providerName: provider.name, result },
            ipAddress: getClientIP(req)
        })

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Sync trigger failed:', error)
        return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 })
    }
}
