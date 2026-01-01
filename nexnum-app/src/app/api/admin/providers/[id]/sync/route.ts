
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncProviderData } from '@/lib/provider-sync'
import { requireAdmin } from '@/lib/requireAdmin'
import { logAdminAction, getClientIP } from '@/lib/auditLog'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin(req)
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
            userId: auth.userId,
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
