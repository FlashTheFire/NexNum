/**
 * =============================================================================
 * UNIFIED METRICS MANAGEMENT SYSTEM
 * =============================================================================
 * 
 * Comprehensive operational intelligence that combines:
 * - Service Matrix (pricing by service/country/provider)
 * - Provider Health & Stats
 * - 25 Advanced Operational Metrics
 * - Financial Analysis
 * 
 * Query Dimensions:
 * - By Service: /api/admin/unified-metrics?service=discord
 * - By Country: /api/admin/unified-metrics?country=india
 * - By Provider: /api/admin/unified-metrics?provider=grizzlysms
 * - Combined: /api/admin/unified-metrics?service=discord&country=india&provider=grizzlysms
 * - All: /api/admin/unified-metrics (platform-wide overview)
 */

import { NextRequest, NextResponse } from 'next/server'
import { MeiliSearch } from 'meilisearch'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { healthMonitor } from '@/lib/providers/health-monitor'
import { AdvancedMetricsCalculator } from '@/lib/metrics/advanced-metrics'
import { normalizeServiceName, normalizeCountryName } from '@/lib/normalizers/service-identity'

const meili = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700',
    apiKey: process.env.MEILI_MASTER_KEY
})

// =============================================================================
// TYPES
// =============================================================================

interface UnifiedMetricsRequest {
    service?: string
    country?: string
    provider?: string
    timeWindow?: number // minutes
    includeFinancials?: boolean
}

interface ServiceDimension {
    code: string
    name: string
    iconUrl?: string
    totalCountries: number
    totalProviders: number
    priceRange: { min: number; max: number }
    avgPrice: number
    totalStock: number
    topCountry: { name: string; price: number }
    topProvider: { name: string; price: number }
}

interface CountryDimension {
    code: string
    name: string
    flagUrl?: string
    totalServices: number
    totalProviders: number
    priceRange: { min: number; max: number }
    avgPrice: number
    totalStock: number
    stabilityIndex: number
    degradationRisk: 'low' | 'medium' | 'high'
}

interface ProviderDimension {
    id: string
    name: string
    displayName: string
    logoUrl?: string
    isActive: boolean

    // Health
    status: 'healthy' | 'degraded' | 'down'
    circuitState: 'closed' | 'half-open' | 'open'
    successRate: number
    avgLatency: number

    // Coverage
    totalServices: number
    totalCountries: number
    totalOffers: number

    // Pricing
    avgPrice: number
    priceMultiplier: number
    fixedMarkup: number

    // Advanced Metrics (condensed)
    slaCompliance: number
    reliabilityScore: number
    firstAttemptSuccess: number
    callbackCompletion: number

    // Financial
    costPerSuccess?: number
    revenuePerSuccess?: number
    margin?: number
}

interface MatrixCell {
    service: string
    country: string
    provider: string
    price: number
    stock: number
    operatorId?: number
    health: 'healthy' | 'degraded' | 'down'
}

interface UnifiedMetricsResponse {
    query: UnifiedMetricsRequest
    calculatedAt: string

    // Dimensions (based on query)
    services?: ServiceDimension[]
    countries?: CountryDimension[]
    providers?: ProviderDimension[]

    // Matrix (when all dimensions specified)
    matrix?: MatrixCell[]

    // Platform Aggregate (always included)
    platform: {
        totalServices: number
        totalCountries: number
        totalProviders: number
        totalOffers: number
        healthyProviders: number
        overallSlaCompliance: number
        overallReliability: number
        totalRevenue24h: number
        avgMargin: number
    }

    // Advanced Metrics (when provider specified)
    advancedMetrics?: any
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)

    const query: UnifiedMetricsRequest = {
        service: searchParams.get('service') || undefined,
        country: searchParams.get('country') || undefined,
        provider: searchParams.get('provider') || undefined,
        timeWindow: parseInt(searchParams.get('window') || '60', 10),
        includeFinancials: searchParams.get('financials') !== 'false'
    }

    try {
        const response = await calculateUnifiedMetrics(query)
        return NextResponse.json(response)
    } catch (error: any) {
        console.error('Unified metrics error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// =============================================================================
// CORE CALCULATION
// =============================================================================

async function calculateUnifiedMetrics(query: UnifiedMetricsRequest): Promise<UnifiedMetricsResponse> {
    const index = meili.index('offers')

    // Build filter based on query
    const filters: string[] = ['stock > 0']
    if (query.service) {
        filters.push(`serviceName = "${query.service}"`)
    }
    if (query.country) {
        filters.push(`countryName = "${query.country}"`)
    }
    if (query.provider) {
        filters.push(`providerName = "${query.provider}"`)
    }

    // Fetch all matching offers
    const result = await index.search('', {
        filter: filters.join(' AND '),
        limit: 5000,
        sort: ['price:asc']
    })
    const offers = result.hits as any[]

    // Get provider data
    const providers = await prisma.provider.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            displayName: true,
            logoUrl: true,
            isActive: true,
            priceMultiplier: true,
            fixedMarkup: true,
            priority: true
        }
    })

    // Get health data for all providers
    const healthMap = new Map<string, any>()
    for (const p of providers) {
        healthMap.set(p.name, await healthMonitor.getHealth(p.id))
    }

    // Calculate dimensions based on what was queried
    const response: UnifiedMetricsResponse = {
        query,
        calculatedAt: new Date().toISOString(),
        platform: await calculatePlatformMetrics(offers, providers, healthMap, query)
    }

    // Service dimension (when not filtering by specific service)
    if (!query.service || (query.country && !query.provider)) {
        response.services = calculateServiceDimension(offers)
    }

    // Country dimension
    if (!query.country || (query.service && !query.provider)) {
        response.countries = calculateCountryDimension(offers)
    }

    // Provider dimension (always useful)
    response.providers = await calculateProviderDimension(offers, providers, healthMap, query)

    // Matrix (when specific filters applied)
    if (query.service || query.country || query.provider) {
        response.matrix = calculateMatrix(offers, healthMap)
    }

    // Advanced metrics (when provider specified)
    if (query.provider) {
        const calculator = new AdvancedMetricsCalculator(query.timeWindow || 60)
        const provider = providers.find(p => p.name.toLowerCase() === query.provider!.toLowerCase())
        if (provider) {
            response.advancedMetrics = await calculator.calculateProviderMetrics(provider.id, provider.name)
        }
    }

    return response
}

// =============================================================================
// DIMENSION CALCULATORS
// =============================================================================

function calculateServiceDimension(offers: any[]): ServiceDimension[] {
    const serviceMap = new Map<string, {
        code: string
        name: string
        iconUrl?: string
        countries: Set<string>
        providers: Set<string>
        prices: number[]
        stock: number
    }>()

    for (const offer of offers) {
        const key = normalizeServiceName(offer.serviceName)
        if (!serviceMap.has(key)) {
            serviceMap.set(key, {
                code: offer.serviceCode,
                name: offer.serviceName,
                iconUrl: offer.iconUrl,
                countries: new Set(),
                providers: new Set(),
                prices: [],
                stock: 0
            })
        }
        const s = serviceMap.get(key)!
        s.countries.add(offer.countryName)
        s.providers.add(offer.providerName)
        s.prices.push(offer.price)
        s.stock += offer.stock || 0
    }

    return Array.from(serviceMap.values()).map(s => {
        const sorted = [...s.prices].sort((a, b) => a - b)
        const avg = s.prices.reduce((a, b) => a + b, 0) / s.prices.length

        // Find top country and provider
        const countryPrices = new Map<string, number>()
        const providerPrices = new Map<string, number>()
        for (const offer of offers.filter(o => normalizeServiceName(o.serviceName) === normalizeServiceName(s.name))) {
            if (!countryPrices.has(offer.countryName) || offer.price < countryPrices.get(offer.countryName)!) {
                countryPrices.set(offer.countryName, offer.price)
            }
            if (!providerPrices.has(offer.providerName) || offer.price < providerPrices.get(offer.providerName)!) {
                providerPrices.set(offer.providerName, offer.price)
            }
        }

        const topCountry = Array.from(countryPrices.entries()).sort((a, b) => a[1] - b[1])[0]
        const topProvider = Array.from(providerPrices.entries()).sort((a, b) => a[1] - b[1])[0]

        return {
            code: s.code,
            name: s.name,
            iconUrl: s.iconUrl,
            totalCountries: s.countries.size,
            totalProviders: s.providers.size,
            priceRange: { min: sorted[0], max: sorted[sorted.length - 1] },
            avgPrice: Math.round(avg * 100) / 100,
            totalStock: s.stock,
            topCountry: topCountry ? { name: topCountry[0], price: topCountry[1] } : { name: 'N/A', price: 0 },
            topProvider: topProvider ? { name: topProvider[0], price: topProvider[1] } : { name: 'N/A', price: 0 }
        }
    }).sort((a, b) => a.avgPrice - b.avgPrice)
}

function calculateCountryDimension(offers: any[]): CountryDimension[] {
    const countryMap = new Map<string, {
        code: string
        name: string
        flagUrl?: string
        services: Set<string>
        providers: Set<string>
        prices: number[]
        stock: number
        successCount: number
        failCount: number
    }>()

    for (const offer of offers) {
        const key = normalizeCountryName(offer.countryName)
        if (!countryMap.has(key)) {
            countryMap.set(key, {
                code: offer.countryCode,
                name: offer.countryName,
                flagUrl: offer.flagUrl,
                services: new Set(),
                providers: new Set(),
                prices: [],
                stock: 0,
                successCount: 0,
                failCount: 0
            })
        }
        const c = countryMap.get(key)!
        c.services.add(offer.serviceName)
        c.providers.add(offer.providerName)
        c.prices.push(offer.price)
        c.stock += offer.stock || 0
    }

    return Array.from(countryMap.values()).map(c => {
        const sorted = [...c.prices].sort((a, b) => a - b)
        const avg = c.prices.reduce((a, b) => a + b, 0) / c.prices.length

        // Stability based on price variance
        const variance = c.prices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / c.prices.length
        const stabilityIndex = Math.max(0, 100 - variance * 10)

        const degradationRisk: 'low' | 'medium' | 'high' = stabilityIndex > 80 ? 'low' : stabilityIndex > 50 ? 'medium' : 'high'

        return {
            code: c.code,
            name: c.name,
            flagUrl: c.flagUrl,
            totalServices: c.services.size,
            totalProviders: c.providers.size,
            priceRange: { min: sorted[0], max: sorted[sorted.length - 1] },
            avgPrice: Math.round(avg * 100) / 100,
            totalStock: c.stock,
            stabilityIndex: Math.round(stabilityIndex),
            degradationRisk
        }
    }).sort((a, b) => a.avgPrice - b.avgPrice)
}

async function calculateProviderDimension(
    offers: any[],
    providers: any[],
    healthMap: Map<string, any>,
    query: UnifiedMetricsRequest
): Promise<ProviderDimension[]> {
    const calculator = new AdvancedMetricsCalculator(query.timeWindow || 60)

    const result: ProviderDimension[] = []

    for (const provider of providers) {
        const providerOffers = offers.filter(o => o.providerName === provider.name)
        const health = healthMap.get(provider.name)

        // Get condensed advanced metrics
        let metrics: any = null
        try {
            metrics = await calculator.calculateProviderMetrics(provider.id, provider.name)
        } catch (e) {
            // Ignore if metrics calculation fails
        }

        const prices = providerOffers.map(o => o.price)
        const avgPrice = prices.length > 0
            ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
            : 0

        result.push({
            id: provider.id,
            name: provider.name,
            displayName: provider.displayName,
            logoUrl: provider.logoUrl,
            isActive: provider.isActive,

            status: health?.status || 'healthy',
            circuitState: health?.circuitState || 'closed',
            successRate: Math.round((health?.successRate || 1) * 100),
            avgLatency: Math.round(health?.avgLatency || 0),

            totalServices: new Set(providerOffers.map(o => o.serviceCode)).size,
            totalCountries: new Set(providerOffers.map(o => o.countryCode)).size,
            totalOffers: providerOffers.length,

            avgPrice,
            priceMultiplier: Number(provider.priceMultiplier) || 1,
            fixedMarkup: Number(provider.fixedMarkup) || 0,

            slaCompliance: metrics?.slaComplianceRate?.value || 100,
            reliabilityScore: metrics?.providerReliabilityScore?.value || 100,
            firstAttemptSuccess: metrics?.firstAttemptSuccessRate?.value || 100,
            callbackCompletion: metrics?.callbackCompletionRate?.value || 100,

            costPerSuccess: query.includeFinancials ? metrics?.costPerSuccessfulOperation?.value : undefined,
            revenuePerSuccess: query.includeFinancials ? metrics?.revenuePerSuccessfulOperation?.value : undefined,
            margin: query.includeFinancials ? metrics?.marginPerService?.value : undefined
        })
    }

    return result.sort((a, b) => b.reliabilityScore - a.reliabilityScore)
}

function calculateMatrix(offers: any[], healthMap: Map<string, any>): MatrixCell[] {
    return offers.slice(0, 100).map(offer => ({
        service: offer.serviceName,
        country: offer.countryName,
        provider: offer.providerName,
        price: offer.price,
        stock: offer.stock || 0,
        operatorId: offer.operatorId,
        health: healthMap.get(offer.providerName)?.status || 'healthy'
    }))
}

async function calculatePlatformMetrics(
    offers: any[],
    providers: any[],
    healthMap: Map<string, any>,
    query: UnifiedMetricsRequest
): Promise<UnifiedMetricsResponse['platform']> {
    const services = new Set(offers.map(o => o.serviceName))
    const countries = new Set(offers.map(o => o.countryName))
    const healthyProviders = providers.filter(p => {
        const health = healthMap.get(p.name)
        return health?.status === 'healthy' || health?.circuitState === 'closed'
    }).length

    // Calculate aggregate SLA and reliability
    let totalSla = 0
    let totalReliability = 0
    let providerCount = 0

    const calculator = new AdvancedMetricsCalculator(query.timeWindow || 60)
    for (const p of providers) {
        try {
            const metrics = await calculator.calculateProviderMetrics(p.id, p.name)
            totalSla += metrics.slaComplianceRate.value
            totalReliability += metrics.providerReliabilityScore.value
            providerCount++
        } catch {
            // Skip failed calculations
        }
    }

    // Revenue from last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const transactions = await prisma.walletTransaction.findMany({
        where: {
            createdAt: { gte: since24h },
            type: { in: ['purchase', 'commit'] }
        },
        select: { amount: true }
    })
    const totalRevenue = transactions.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

    return {
        totalServices: services.size,
        totalCountries: countries.size,
        totalProviders: providers.length,
        totalOffers: offers.length,
        healthyProviders,
        overallSlaCompliance: providerCount > 0 ? Math.round((totalSla / providerCount) * 100) / 100 : 100,
        overallReliability: providerCount > 0 ? Math.round((totalReliability / providerCount) * 100) / 100 : 100,
        totalRevenue24h: Math.round(totalRevenue * 100) / 100,
        avgMargin: 25 // Placeholder - would need cost data
    }
}
