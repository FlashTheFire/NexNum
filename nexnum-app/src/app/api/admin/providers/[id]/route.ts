
// Types synchronized with schema
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { requireAdmin, redactProviderSecrets } from '@/lib/auth/requireAdmin'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'

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

        // Sanitise numeric/decimal fields
        const sanitizedBody = { ...body }
        const numericFields = [
            'priceMultiplier', 'fixedMarkup', 'priority',
            'normalizationRate', 'depositSpent', 'depositReceived'
        ]

        numericFields.forEach(field => {
            if (sanitizedBody[field] !== undefined) {
                if (sanitizedBody[field] === '' || sanitizedBody[field] === null) {
                    // Default values if empty
                    if (field === 'priceMultiplier') sanitizedBody[field] = 1.0
                    else if (field === 'priority') sanitizedBody[field] = 0
                    else sanitizedBody[field] = 0.0
                } else {
                    sanitizedBody[field] = Number(sanitizedBody[field])
                }
            }
        })

        // Get original for audit comparison
        const original = await prisma.provider.findUnique({ where: { id } })

        const provider = await prisma.provider.update({
            where: { id },
            data: {
                // Core Identity
                ...(body.name !== undefined && { name: body.name }),
                ...(body.displayName !== undefined && { displayName: body.displayName }),
                ...(body.description !== undefined && { description: body.description }),
                ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
                ...(body.websiteUrl !== undefined && { websiteUrl: body.websiteUrl }),

                // API Configuration
                ...(body.apiBaseUrl !== undefined && { apiBaseUrl: body.apiBaseUrl }),
                ...(body.authType !== undefined && { authType: body.authType }),
                ...(body.authHeader !== undefined && { authHeader: body.authHeader }),
                ...(body.authQueryParam !== undefined && { authQueryParam: body.authQueryParam }),

                // Dynamic Engine Settings (NEW!)
                ...(body.useDynamicMetadata !== undefined && { useDynamicMetadata: body.useDynamicMetadata }),
                ...(body.dynamicFunctions !== undefined && { dynamicFunctions: body.dynamicFunctions }),

                // Endpoint/Mapping Configuration
                ...(body.endpoints !== undefined && { endpoints: body.endpoints }),
                ...(body.mappings !== undefined && { mappings: body.mappings }),

                // Business Logic
                ...(body.currency !== undefined && { currency: body.currency }),
                ...(sanitizedBody.priceMultiplier !== undefined && { priceMultiplier: sanitizedBody.priceMultiplier }),
                ...(sanitizedBody.fixedMarkup !== undefined && { fixedMarkup: sanitizedBody.fixedMarkup }),
                ...(sanitizedBody.priority !== undefined && { priority: sanitizedBody.priority }),

                // Normalization
                ...(body.normalizationMode !== undefined && { normalizationMode: body.normalizationMode }),
                ...(sanitizedBody.normalizationRate !== undefined && { normalizationRate: sanitizedBody.normalizationRate }),
                ...(body.apiPair !== undefined && { apiPair: body.apiPair }),
                ...(sanitizedBody.depositSpent !== undefined && { depositSpent: sanitizedBody.depositSpent }),
                ...(sanitizedBody.depositReceived !== undefined && { depositReceived: sanitizedBody.depositReceived }),
                ...(body.depositCurrency !== undefined && { depositCurrency: body.depositCurrency }),

                // Status
                ...(body.isActive !== undefined && { isActive: body.isActive }),

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
