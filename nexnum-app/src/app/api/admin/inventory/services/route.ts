/**
 * Admin Inventory - Services Management API
 * 
 * PATCH: Hide/Unhide/Edit a service
 * DELETE: Delete a service (soft or permanent)
 */

import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import {
    toggleServiceVisibility,
    deleteService,
    updateService
} from '@/lib/admin/inventory-manager'

import { prisma } from '@/lib/core/db'

export async function PATCH(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { providerId, externalId, action, updates } = body

        if (!providerId || !externalId) {
            return NextResponse.json(
                { error: 'Missing required fields: providerId, externalId' },
                { status: 400 }
            )
        }

        // Resolve provider ID (handle slugs like 'sms-activate')
        const provider = await prisma.provider.findFirst({
            where: {
                OR: [
                    { id: providerId },
                    { name: providerId }
                ]
            },
            select: { id: true }
        })

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        const targetProviderId = provider.id
        let result

        if (action === 'hide') {
            result = await toggleServiceVisibility(targetProviderId, externalId, false, auth.user.userId)
        } else if (action === 'unhide') {
            result = await toggleServiceVisibility(targetProviderId, externalId, true, auth.user.userId)
        } else if (action === 'edit' && updates) {
            result = await updateService(targetProviderId, externalId, updates, auth.user.userId)
        } else {
            return NextResponse.json(
                { error: 'Invalid action. Use: hide, unhide, or edit' },
                { status: 400 }
            )
        }

        if (!result.success) {
            return NextResponse.json({ error: result.message }, { status: 400 })
        }

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Services PATCH error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { providerId, externalId, permanent = false } = body

        if (!providerId || !externalId) {
            return NextResponse.json(
                { error: 'Missing required fields: providerId, externalId' },
                { status: 400 }
            )
        }

        // Resolve provider ID
        const provider = await prisma.provider.findFirst({
            where: {
                OR: [
                    { id: providerId },
                    { name: providerId }
                ]
            },
            select: { id: true }
        })

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        const result = await deleteService(provider.id, externalId, permanent, auth.user.userId)

        if (!result.success) {
            return NextResponse.json({ error: result.message }, { status: 400 })
        }

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Services DELETE error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

