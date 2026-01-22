import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { revokeApiKey, deleteApiKey } from '@/lib/api/api-keys'

// DELETE /api/keys/[id] - Revoke (soft delete) or Delete API key
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const url = new URL(request.url)
        const hardDelete = url.searchParams.get('hard') === 'true'

        let result = false
        if (hardDelete) {
            result = await deleteApiKey(id, user.userId)
        } else {
            result = await revokeApiKey(id, user.userId)
        }

        if (!result) {
            return NextResponse.json({ error: 'Key not found or already deleted' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            message: hardDelete ? 'API key deleted' : 'API key revoked'
        })

    } catch (error) {
        console.error('Delete API key error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
