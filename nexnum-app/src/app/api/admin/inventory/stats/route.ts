/**
 * Admin Inventory Stats API
 * 
 * Returns aggregated inventory statistics for the stats header
 */

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { meili, INDEXES } from '@/lib/search/search'
import { prisma } from '@/lib/core/db'

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const index = meili.index(INDEXES.OFFERS)

        // Get all offers for aggregation
        const result = await index.search('', {
            limit: 50000,
            attributesToRetrieve: ['countryCode', 'countryName', 'serviceCode', 'serviceName', 'providerName', 'stock', 'isActive', 'lastSyncedAt'],
        })

        const countries = new Set<string>()
        const services = new Set<string>()
        const providers = new Set<string>()
        let hiddenItems = 0
        let totalStock = 0
        let lastSyncTime = 0

        for (const hit of result.hits as any[]) {
            // Count unique countries (by normalized name)
            if (hit.countryName) {
                countries.add(hit.countryName.toLowerCase())
            }

            // Count unique services (by name)
            if (hit.serviceName) {
                services.add(hit.serviceName.toLowerCase())
            }

            // Count providers
            if (hit.providerName) {
                providers.add(hit.providerName)
            }

            // Count hidden
            if (hit.isActive === false) {
                hiddenItems++
            }

            // Sum stock
            totalStock += hit.stock || 0

            // Track latest sync
            if (hit.lastSyncedAt && hit.lastSyncedAt > lastSyncTime) {
                lastSyncTime = hit.lastSyncedAt
            }
        }

        // Get active providers from database
        const activeProviders = await prisma.provider.count({
            where: { isActive: true }
        })

        return NextResponse.json({
            totalCountries: countries.size,
            totalServices: services.size,
            hiddenItems,
            activeProviders,
            totalStock,
            lastSyncTime: lastSyncTime || Date.now()
        })
    } catch (error) {
        console.error('Inventory stats error:', error)
        return NextResponse.json({
            totalCountries: 0,
            totalServices: 0,
            hiddenItems: 0,
            activeProviders: 0,
            totalStock: 0,
            lastSyncTime: null
        })
    }
}
