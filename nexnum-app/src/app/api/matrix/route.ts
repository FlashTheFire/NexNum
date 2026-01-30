/**
 * Service Matrix API
 * 
 * Professional pricing matrix with flexible dimensions:
 * 
 * Query Modes:
 * 1. /api/matrix?service=discord                           → All countries × All providers
 * 2. /api/matrix?service=discord&country=india             → Selected country × All providers
 * 3. /api/matrix?service=example&provider=provider-a       → All countries × Selected provider
 * 4. /api/matrix?service=example&country=usa&provider=provider-a → Specific offer
 */

import { NextRequest, NextResponse } from 'next/server'
import { MeiliSearch } from 'meilisearch'
import { prisma } from '@/lib/core/db'
import { healthMonitor } from '@/lib/providers/health-monitor'
import { generateCanonicalCode, normalizeCountryName } from '@/lib/normalizers/service-identity'
import { logger } from '@/lib/core/logger'

const meili = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700',
    apiKey: process.env.MEILI_MASTER_KEY
})

const OFFERS_INDEX = 'offers'

interface MatrixCell {
    provider: string
    providerDisplay: string
    price: number
    originalPrice: number
    stock: number
    operatorId?: number
    operatorName?: string
    health: {
        status: 'healthy' | 'degraded' | 'down'
        successRate: number
    }
}

interface CountryRow {
    countryCode: string
    countryName: string
    flagUrl?: string
    providers: MatrixCell[]
    lowestPrice: number
    bestProvider: string
}

interface ProviderColumn {
    provider: string
    providerDisplay: string
    logoUrl?: string
    health: {
        status: 'healthy' | 'degraded' | 'down'
        successRate: number
        avgLatency: number
    }
    totalOffers: number
    avgPrice: number
}

interface MatrixResponse {
    service: {
        code: string
        name: string
        iconUrl?: string
    }
    mode: 'full' | 'by_country' | 'by_provider' | 'specific'
    filters: {
        country?: string
        provider?: string
    }
    // Matrix data
    countries: CountryRow[]
    providers: ProviderColumn[]
    // Aggregates
    summary: {
        totalCountries: number
        totalProviders: number
        totalOffers: number
        priceRange: { min: number; max: number }
        bestDeal: {
            country: string
            provider: string
            price: number
        }
    }
    cachedAt: string
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)

    const serviceInput = searchParams.get('service')
    const countryInput = searchParams.get('country')
    const providerInput = searchParams.get('provider')
    const includeOutOfStock = searchParams.get('includeOutOfStock') === 'true'

    if (!serviceInput) {
        return NextResponse.json({
            error: 'service parameter required',
            usage: '/api/matrix?service=example[&country=usa][&provider=provider-a]'
        }, { status: 400 })
    }

    try {
        const index = meili.index(OFFERS_INDEX)

        // Build filter
        const filters: string[] = []

        // Service filter (Strict Name Match)
        filters.push(`serviceName = "${serviceInput}"`)

        // Stock filter
        if (!includeOutOfStock) {
            filters.push('stock > 0')
        }

        // Optional filters
        if (countryInput) {
            filters.push(`countryName = "${countryInput}"`)
        }

        if (providerInput) {
            filters.push(`providerName = "${providerInput}"`)
        }

        // Fetch all matching offers
        const result = await index.search('', {
            filter: filters.join(' AND '),
            limit: 1000,
            sort: ['price:asc']
        })

        const offers = result.hits as any[]

        if (offers.length === 0) {
            return NextResponse.json({
                error: 'No offers found',
                filters: { service: serviceInput, country: countryInput, provider: providerInput }
            }, { status: 404 })
        }

        const serviceInfo = {
            code: generateCanonicalCode(offers[0].serviceName),
            name: offers[0].serviceName,
            iconUrl: offers[0].iconUrl
        }

        // Get provider health data
        const providerHealthMap = await getProviderHealthMap()

        // Get provider display names
        const providerDisplayMap = await getProviderDisplayMap()

        // Build matrix
        const countryMap = new Map<string, CountryRow>()
        const providerStatsMap = new Map<string, { prices: number[], count: number }>()
        let globalMin = Infinity
        let globalMax = 0
        let bestDeal = { country: '', provider: '', price: Infinity }

        for (const offer of offers) {
            const countryKey = normalizeCountryName(offer.countryName)
            const providerKey = offer.providerName

            // Track provider stats
            if (!providerStatsMap.has(providerKey)) {
                providerStatsMap.set(providerKey, { prices: [], count: 0 })
            }
            providerStatsMap.get(providerKey)!.prices.push(offer.price)
            providerStatsMap.get(providerKey)!.count++

            // Track global stats
            globalMin = Math.min(globalMin, offer.price)
            globalMax = Math.max(globalMax, offer.price)
            if (offer.price < bestDeal.price) {
                bestDeal = { country: offer.countryName, provider: providerKey, price: offer.price }
            }

            // Build country row
            if (!countryMap.has(countryKey)) {
                countryMap.set(countryKey, {
                    countryCode: generateCanonicalCode(offer.countryName),
                    countryName: offer.countryName,
                    flagUrl: offer.flagUrl,
                    providers: [],
                    lowestPrice: Infinity,
                    bestProvider: ''
                })
            }

            const row = countryMap.get(countryKey)!
            const health = providerHealthMap.get(providerKey) || { status: 'healthy', successRate: 1.0 }

            row.providers.push({
                provider: providerKey,
                providerDisplay: providerDisplayMap.get(providerKey) || providerKey,
                price: offer.price,
                originalPrice: offer.originalPrice || offer.price,
                stock: offer.stock,
                operatorId: offer.operatorId,
                operatorName: offer.operatorName,
                health: {
                    status: health.status as any,
                    successRate: Math.round(health.successRate * 100)
                }
            })

            if (offer.price < row.lowestPrice) {
                row.lowestPrice = offer.price
                row.bestProvider = providerKey
            }
        }

        // Build provider columns
        const providerColumns: ProviderColumn[] = []
        for (const [provider, stats] of providerStatsMap) {
            const health = providerHealthMap.get(provider)
            const providerInfo = await prisma.provider.findFirst({
                where: { name: provider },
                select: { logoUrl: true }
            })

            providerColumns.push({
                provider,
                providerDisplay: providerDisplayMap.get(provider) || provider,
                logoUrl: providerInfo?.logoUrl || undefined,
                health: {
                    status: health?.status as any || 'healthy',
                    successRate: Math.round((health?.successRate || 1) * 100),
                    avgLatency: health?.avgLatency || 0
                },
                totalOffers: stats.count,
                avgPrice: Math.round((stats.prices.reduce((a, b) => a + b, 0) / stats.prices.length) * 100) / 100
            })
        }

        // Sort providers by average price
        providerColumns.sort((a, b) => a.avgPrice - b.avgPrice)

        // Build response
        const countries = Array.from(countryMap.values())
        countries.sort((a, b) => a.lowestPrice - b.lowestPrice)

        // Determine mode
        let mode: 'full' | 'by_country' | 'by_provider' | 'specific' = 'full'
        if (countryInput && providerInput) mode = 'specific'
        else if (countryInput) mode = 'by_country'
        else if (providerInput) mode = 'by_provider'

        const response: MatrixResponse = {
            service: serviceInfo,
            mode,
            filters: {
                country: countryInput || undefined,
                provider: providerInput || undefined
            },
            countries,
            providers: providerColumns,
            summary: {
                totalCountries: countryMap.size,
                totalProviders: providerStatsMap.size,
                totalOffers: offers.length,
                priceRange: { min: globalMin, max: globalMax },
                bestDeal
            },
            cachedAt: new Date().toISOString()
        }

        return NextResponse.json(response)

    } catch (error: any) {
        logger.error('Matrix API error', { error, context: 'API_MATRIX' })
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// Helper: Get health for all active providers
async function getProviderHealthMap(): Promise<Map<string, any>> {
    const map = new Map()
    try {
        const providers = await prisma.provider.findMany({
            where: { isActive: true },
            select: { id: true, name: true }
        })

        for (const p of providers) {
            const health = await healthMonitor.getHealth(p.id)
            map.set(p.name, health)
        }
    } catch (e) {
        logger.error('Failed to get provider health', { error: e, context: 'API_MATRIX' })
    }
    return map
}

// Helper: Get display names for providers
async function getProviderDisplayMap(): Promise<Map<string, string>> {
    const map = new Map()
    try {
        const providers = await prisma.provider.findMany({
            select: { name: true, displayName: true }
        })
        for (const p of providers) {
            map.set(p.name, p.displayName)
        }
    } catch (e) {
        logger.error('Failed to get provider names', { error: e, context: 'API_MATRIX' })
    }
    return map
}
