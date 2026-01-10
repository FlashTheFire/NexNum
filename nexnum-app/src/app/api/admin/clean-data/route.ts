import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { meili } from '@/lib/search/search'

export async function POST() {
    try {
        console.log('🗑️  Cleaning provider data...')

        // Delete provider pricing
        const pricingDeleted = await prisma.providerPricing.deleteMany({})
        console.log(`   Deleted ${pricingDeleted.count} pricing records`)

        // Delete provider services
        const servicesDeleted = await prisma.providerService.deleteMany({})
        console.log(`   Deleted ${servicesDeleted.count} service records`)

        // Delete provider countries
        const countriesDeleted = await prisma.providerCountry.deleteMany({})
        console.log(`   Deleted ${countriesDeleted.count} country records`)

        // Reset metadata sync timestamps to force fresh fetch
        await prisma.provider.updateMany({
            data: { lastMetadataSyncAt: null, lastSyncAt: null }
        })
        console.log('   Reset sync timestamps')

        // Clear MeiliSearch offers index
        try {
            await meili.index('offers').deleteAllDocuments()
            console.log('   Cleared MeiliSearch offers index')
        } catch (e) {
            console.warn('   Could not clear MeiliSearch:', e)
        }

        return NextResponse.json({
            success: true,
            deleted: {
                pricing: pricingDeleted.count,
                services: servicesDeleted.count,
                countries: countriesDeleted.count
            }
        })
    } catch (error) {
        console.error('Clean failed:', error)
        return NextResponse.json({ error: 'Clean failed' }, { status: 500 })
    }
}
