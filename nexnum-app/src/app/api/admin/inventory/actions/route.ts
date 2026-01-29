import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import { unifiedInventory, InventoryItemType, InventoryAction } from '@/lib/admin/unified-inventory'

export async function POST(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { providerId, externalId, action, type, payload, permanent } = body

        if (!providerId || !externalId || !action) {
            return NextResponse.json(
                { error: 'Missing required fields: providerId, externalId, action' },
                { status: 400 }
            )
        }

        const result = await unifiedInventory.dispatchAction(auth.user.userId, {
            providerId,
            externalId,
            type: (type as InventoryItemType) || 'auto',
            action: (action as InventoryAction),
            payload,
            permanent
        })

        if (!result.success) {
            return NextResponse.json(
                { error: result.message, code: result.error },
                { status: result.error === 'NOT_FOUND' ? 404 : 400 }
            )
        }

        return NextResponse.json({ success: true, message: result.message, data: result.data })

    } catch (error: any) {
        console.error('[InventoryActions] Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

