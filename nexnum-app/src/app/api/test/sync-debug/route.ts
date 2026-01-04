import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DynamicProvider } from '@/lib/dynamic-provider'
import { indexOffers, OfferDocument } from '@/lib/search'

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams
        const providerName = searchParams.get('provider') || 'smsbower'
        const countryCode = searchParams.get('country') // e.g., '22'
        const countryName = searchParams.get('name') || 'India'

        if (!countryCode) {
            return NextResponse.json({ error: 'Missing country code' }, { status: 400 })
        }

        // 1. Get Provider
        const provider = await prisma.provider.findUnique({
            where: { name: providerName }
        })

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        const engine = new DynamicProvider(provider)

        // 1.1 Fetch Service Map from DB (for correct naming)
        // We need to fetch ALL services for this provider to map codes -> names
        const dbServices = await prisma.providerService.findMany({
            where: { providerId: provider.id },
            select: { externalId: true, name: true }
        })
        const serviceMap = new Map<string, string>()
        dbServices.forEach(s => serviceMap.set(s.externalId, s.name))

        // 2. Fetch Prices
        const startTime = Date.now()
        console.log(`[TEST] Fetching prices for ${providerName} -> Country ${countryCode}...`)

        const prices = await engine.getPrices(countryCode)
        const duration = Date.now() - startTime

        // 3. Index to Search (Simulate Sync)
        let indexedCount = 0
        if (prices.length > 0) {
            const stockItems = prices.filter(p => p.count > 0)

            const offers: OfferDocument[] = stockItems.map(p => ({
                id: `${provider.name}_${p.country}_${p.service}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                provider: provider.name,
                displayName: provider.displayName,
                countryCode: p.country, // '22'
                countryName: countryName,
                flagUrl: '',
                serviceSlug: p.service.toLowerCase(),
                serviceName: serviceMap.get(p.service) || p.service, // Use mapped name
                price: p.cost,
                stock: p.count,
                lastSyncedAt: Date.now()
            }))

            if (offers.length > 0) {
                await indexOffers(offers)
                indexedCount = offers.length
            }
        }

        return NextResponse.json({
            success: true,
            provider: providerName,
            country: countryCode,
            fetchedItems: prices.length,
            indexedItems: indexedCount,
            sample: prices.slice(0, 3), // Show first 3
            duration: `${duration}ms`
        })

    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 })
    }
}
