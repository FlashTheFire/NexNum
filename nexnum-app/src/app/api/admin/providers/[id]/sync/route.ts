
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { syncProviderData } from '@/lib/providers/provider-sync'
import { AuthGuard } from '@/lib/auth/guard'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const provider = await prisma.provider.findUnique({ where: { id } })
        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        const result = await syncProviderData(provider.name)

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
