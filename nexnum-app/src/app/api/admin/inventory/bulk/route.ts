/**
 * Admin Inventory - Bulk Operations API
 * 
 * POST: Bulk hide/unhide/delete for countries or services
 */

import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import {
    bulkCountryOperation,
    bulkServiceOperation
} from '@/lib/admin/inventory-manager'

export async function POST(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { type, action, items, permanent = false } = body

        if (!type || !action || !items || !Array.isArray(items)) {
            return NextResponse.json(
                { error: 'Missing required fields: type, action, items[]' },
                { status: 400 }
            )
        }

        if (!['countries', 'services'].includes(type)) {
            return NextResponse.json(
                { error: 'Invalid type. Use: countries or services' },
                { status: 400 }
            )
        }

        if (!['hide', 'unhide', 'delete'].includes(action)) {
            return NextResponse.json(
                { error: 'Invalid action. Use: hide, unhide, or delete' },
                { status: 400 }
            )
        }

        // Validate items structure
        for (const item of items) {
            if (!item.providerId || !item.externalId) {
                return NextResponse.json(
                    { error: 'Each item must have providerId and externalId' },
                    { status: 400 }
                )
            }
        }

        let result

        if (type === 'countries') {
            result = await bulkCountryOperation(items, action, permanent, auth.user.userId)
        } else {
            result = await bulkServiceOperation(items, action, permanent, auth.user.userId)
        }

        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Bulk operation error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

