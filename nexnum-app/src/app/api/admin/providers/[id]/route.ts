
// Types synchronized with schema
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin, redactProviderSecrets } from '@/lib/requireAdmin'
import { logAdminAction, getClientIP } from '@/lib/auditLog'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin(req)
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const provider = await prisma.provider.findUnique({
            where: { id },
            include: {
                testResults: {
                    orderBy: { testedAt: 'desc' },
                    take: 10
                }
            }
        })

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        // REDACT authKey before returning
        return NextResponse.json(redactProviderSecrets(provider))
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin(req)
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const body = await req.json()

        // Get original for audit comparison
        const original = await prisma.provider.findUnique({ where: { id } })

        const provider = await prisma.provider.update({
            where: { id },
            data: {
                ...body,
                updatedAt: new Date()
            }
        })

        // Audit log the update
        await logAdminAction({
            userId: auth.userId,
            action: body.isActive !== undefined ? 'PROVIDER_TOGGLE' : 'PROVIDER_UPDATE',
            resourceType: 'Provider',
            resourceId: provider.id,
            metadata: {
                name: provider.name,
                changes: Object.keys(body).filter(k => k !== 'authKey') // Don't log authKey changes
            },
            ipAddress: getClientIP(req)
        })

        // REDACT authKey before returning
        return NextResponse.json(redactProviderSecrets(provider))
    } catch (error) {
        console.error('Update failed:', error)
        return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin(req)
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const provider = await prisma.provider.findUnique({ where: { id } })
        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        // Protection logic
        if (provider.name === 'mock' || provider.priority === 999) {
            return NextResponse.json({ error: 'Cannot delete system default provider.' }, { status: 403 })
        }

        if (provider.isActive) {
            return NextResponse.json({ error: 'Cannot delete an ACTIVE provider. Please deactivate it first.' }, { status: 400 })
        }

        const count = await prisma.provider.count()
        if (count <= 1) {
            return NextResponse.json({ error: 'Cannot delete the only existing provider.' }, { status: 400 })
        }

        await prisma.provider.delete({
            where: { id }
        })

        // Audit log the deletion
        await logAdminAction({
            userId: auth.userId,
            action: 'PROVIDER_DELETE',
            resourceType: 'Provider',
            resourceId: id,
            metadata: { name: provider.name, displayName: provider.displayName },
            ipAddress: getClientIP(req)
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
}
