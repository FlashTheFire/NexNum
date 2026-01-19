/**
 * Admin Inventory - Countries Management API
 * 
 * PATCH: Hide/Unhide/Edit a country
 * DELETE: Delete a country (soft or permanent)
 */

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
    toggleCountryVisibility,
    deleteCountry,
    updateCountry
} from '@/lib/admin/inventory-manager'

export async function PATCH(request: Request) {
    const auth = await requireAdmin(request)
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

        let result

        if (action === 'hide') {
            result = await toggleCountryVisibility(providerId, externalId, false, auth.userId)
        } else if (action === 'unhide') {
            result = await toggleCountryVisibility(providerId, externalId, true, auth.userId)
        } else if (action === 'edit' && updates) {
            result = await updateCountry(providerId, externalId, updates, auth.userId)
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
        console.error('Countries PATCH error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const auth = await requireAdmin(request)
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

        const result = await deleteCountry(providerId, externalId, permanent, auth.userId)

        if (!result.success) {
            return NextResponse.json({ error: result.message }, { status: 400 })
        }

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Countries DELETE error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
