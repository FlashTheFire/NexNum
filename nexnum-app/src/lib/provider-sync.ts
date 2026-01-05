/**
 * Provider Data Sync - Countries & Services Only
 * 
 * Fetches country and service data from SMS providers every 12 hours.
 * Pricing is handled separately at purchase time via real-time API calls.
 * 
 * Supported Providers:
 * - All providers fully integrated via separate configuration (DynamicProvider)
 * - Hybrid Mode for Built-ins: Uses legacy fetch logic for metadata, Dynamic engine for pricing/indexing.
 */

import { prisma } from './db'
import { Provider } from '@prisma/client'
import { DynamicProvider } from './dynamic-provider'
import pLimit from 'p-limit'
import { indexOffers, OfferDocument, deleteOffersByProvider } from './search'
import { logAdminAction } from './auditLog'
import * as dotenv from 'dotenv'
dotenv.config()
import { RateLimitedQueue } from './async-utils'

// Import legacy providers from centralized location
import { getLegacyProvider, hasLegacyProvider } from './provider-factory'
import { refreshAllServiceAggregates } from './service-aggregates'

// ============================================
// TYPES
// ============================================

interface SyncResult {
    provider: string
    countries: number
    services: number
    prices: number
    error?: string
    duration: number
}

// Providers that use legacy logic for metadata fetching
const LEGACY_METADATA_PROVIDERS = ['5sim', 'grizzlysms', 'herosms', 'smsbower']

// ============================================
// HELPERS
// ============================================

const limit = pLimit(10) // Limit DB upserts concurrency

// ... (imports)

// ...

async function upsertCountryLookup(code: string, name: string, flagUrl?: string | null) {
    try {
        await prisma.countryLookup.upsert({
            where: { code },
            // Pass empty string or null for phoneCode column if it exists in DB schema but we want to ignore it
            create: { code, name, flagUrl: flagUrl || null },
            update: { name, flagUrl: flagUrl || undefined }
        })
    } catch (e) { }
}

// ... 

/**
 * Get countries using legacy provider adapter
 */
async function getCountriesLegacy(provider: Provider, engine: DynamicProvider): Promise<{ code: string, name: string, flagUrl?: string | null }[]> {
    const slug = provider.name.toLowerCase()

    if (hasLegacyProvider(slug)) {
        const legacyProvider = getLegacyProvider(slug)
        if (legacyProvider) {
            try {
                const countries = await legacyProvider.getCountries()
                const results: { code: string, name: string, flagUrl?: string | null }[] = []

                for (const c of countries) {
                    await upsertCountryLookup(c.id, c.name, c.flagUrl)
                    results.push({
                        code: c.id,
                        name: c.name,
                        flagUrl: c.flagUrl
                    })
                }
                return results
            } catch (e) { console.warn('Legacy error', e) }
        }
    }

    const dynamicCountries = await engine.getCountries()
    return dynamicCountries.map(c => ({
        code: c.code,
        name: c.name,
        flagUrl: c.flagUrl
    }))
}

// ...



async function upsertServiceLookup(code: string, name: string, iconUrl?: string | null) {
    try {
        await prisma.serviceLookup.upsert({
            where: { code },
            create: { code, name, iconUrl: iconUrl || null },
            update: { name, iconUrl: iconUrl || undefined }
        })
    } catch (e) {
        // Suppress unique constraint race conditions
    }
}

// ============================================
// LEGACY FETCHERS (Using centralized providers)
// ============================================

/**
 * Get countries using legacy provider adapter
 * Delegates to sms-providers/*.ts implementations
 */


/**
 * Get services using legacy provider adapter
 * Delegates to sms-providers/*.ts implementations
 */
async function getServicesLegacy(provider: Provider, engine: DynamicProvider): Promise<void> {
    const slug = provider.name.toLowerCase()

    // Check if we have a legacy provider for this
    if (hasLegacyProvider(slug)) {
        const legacyProvider = getLegacyProvider(slug)
        if (legacyProvider) {
            try {
                const services = await legacyProvider.getServices('')

                // Upsert to lookup table
                await Promise.all(services.map(s => limit(async () => {
                    await upsertServiceLookup(s.id, s.name, s.iconUrl)
                })))

                return
            } catch (e) {
                console.warn(`[SYNC] Legacy provider ${slug} failed for services:`, e)
            }
        }
    }

    // Fallback handled by caller
}


// ============================================
// DYNAMIC SYNC (UNIFIED)
// ============================================

async function syncDynamic(provider: Provider): Promise<SyncResult> {
    const startTime = Date.now()
    let countriesCount = 0, servicesCount = 0, pricesCount = 0, error: string | undefined
    const serviceMap = new Map<string, string>()          // code -> name
    const iconUrlMap = new Map<string, string>()      // code -> iconUrl

    try {
        // Pre-load ALL service names from ServiceLookup table for fallback
        // This ensures serviceName is populated even if service code isn't in getServices()
        const allServiceLookups = await prisma.serviceLookup.findMany({
            select: { code: true, name: true }
        })
        allServiceLookups.forEach(s => {
            serviceMap.set(s.code, s.name)
            serviceMap.set(s.code.toLowerCase(), s.name)
        })
        console.log(`[SYNC] Pre-loaded ${allServiceLookups.length} service names from lookup table`)

        // Update status to syncing
        await prisma.provider.update({
            where: { id: provider.id },
            data: { syncStatus: 'syncing' }
        })

        const engine = new DynamicProvider(provider)

        // Sync Balance
        try {
            const balance = await engine.getBalance()
            await prisma.provider.update({
                where: { id: provider.id },
                data: {
                    balance: balance,
                    lastBalanceSync: new Date()
                }
            })
        } catch (be) {
            console.warn(`[SYNC] Failed to fetch balance for ${provider.name}`, be)
        }

        // 1. Countries (Hybrid: Legacy or Dynamic)
        // CHECK TOGGLE: If useDynamicMetadata is true, FORCE dynamic engine.
        // Otherwise, use legacy if applicable, or fallback to dynamic.
        const useDynamicMetadata = (provider.mappings as any)?.useDynamicMetadata === true

        // Initialize arrays
        let countries: any[] = []
        let services: any[] = []

        // Check if we need fresh metadata (24h rule based on existing DB records)
        const existingCountryCount = await prisma.providerCountry.count({ where: { providerId: provider.id } })
        const hoursSinceMetadata = provider.lastMetadataSyncAt
            ? (Date.now() - provider.lastMetadataSyncAt.getTime()) / (1000 * 60 * 60)
            : 999

        let skipMetadataSync = existingCountryCount > 0 && hoursSinceMetadata < 24

        // Maps for quick lookup (externalId -> dbId)
        const countryIdMap = new Map<string, string>()
        const serviceIdMap = new Map<string, string>()

        if (skipMetadataSync) {
            console.log(`[SYNC] ${provider.name}: Using DB metadata (${hoursSinceMetadata.toFixed(1)}h old, ${existingCountryCount} countries)`)
            // Load existing IDs from DB
            const dbCountries = await prisma.providerCountry.findMany({
                where: { providerId: provider.id },
                select: { id: true, externalId: true, name: true, flagUrl: true }
            })

            // VALIDATION: Check for stale data (countries with 'Unknown' names or missing phoneCode)
            const hasStaleData = dbCountries.some(c => !c.name || c.name === 'Unknown' || c.name === c.externalId)
            if (hasStaleData) {
                console.log(`[SYNC] ${provider.name}: Stale data detected (Unknown/missing names). Forcing fresh fetch...`)
                skipMetadataSync = false
                // Clear the existing bad data
                await prisma.providerCountry.deleteMany({ where: { providerId: provider.id } })
                await prisma.providerService.deleteMany({ where: { providerId: provider.id } })
            } else {
                dbCountries.forEach(c => {
                    countryIdMap.set(c.externalId, c.id)
                    countries.push({ code: c.externalId, name: c.name, flagUrl: c.flagUrl })
                })
                countriesCount = dbCountries.length

                const dbServices = await prisma.providerService.findMany({
                    where: { providerId: provider.id },
                    select: { id: true, externalId: true, name: true, iconUrl: true }
                })
                dbServices.forEach(s => {
                    serviceIdMap.set(s.externalId, s.id)
                    serviceMap.set(s.externalId, s.name)
                    if (s.iconUrl) {
                        iconUrlMap.set(s.externalId, s.iconUrl)
                        iconUrlMap.set(s.externalId.toLowerCase(), s.iconUrl)
                    }
                })
                servicesCount = dbServices.length
            }
        }

        if (!skipMetadataSync) {
            console.log(`[SYNC] ${provider.name}: Fetching fresh metadata...`)

            // Fetch countries
            if (!useDynamicMetadata && LEGACY_METADATA_PROVIDERS.includes(provider.name.toLowerCase())) {
                countries = await getCountriesLegacy(provider, engine)
            } else {
                countries = await engine.getCountries()
            }
            countriesCount = countries.length

            // Upsert countries to DB
            console.log(`[SYNC] ${provider.name}: Upserting ${countries.length} countries to DB...`)
            for (const c of countries) {
                const record = await prisma.providerCountry.upsert({
                    where: { providerId_externalId: { providerId: provider.id, externalId: c.code } },
                    create: {
                        providerId: provider.id,
                        externalId: c.code,
                        code: c.code.toLowerCase(),
                        name: c.name || 'Unknown',
                        flagUrl: c.flag || null,
                        lastSyncAt: new Date()
                    },
                    update: {
                        name: c.name || 'Unknown',
                        flagUrl: c.flag || null,
                        lastSyncAt: new Date()
                    }
                })
                countryIdMap.set(c.code, record.id)
            }

            // Fetch services
            if (!useDynamicMetadata && LEGACY_METADATA_PROVIDERS.includes(provider.name.toLowerCase())) {
                await getServicesLegacy(provider, engine)
                // Load from global lookup since legacy writes there
                const dbServices = await prisma.serviceLookup.findMany()
                services = dbServices.map(s => ({ code: s.code, name: s.name, iconUrl: s.iconUrl }))
            } else {
                try {
                    services = await engine.getServices('')
                } catch (e) {
                    try {
                        services = await engine.getServices('us')
                    } catch (e2) {
                        if (countries.length > 0) services = await engine.getServices(countries[0].code)
                    }
                }
            }
            servicesCount = services.length

            // Upsert services to DB
            console.log(`[SYNC] ${provider.name}: Upserting ${services.length} services to DB...`)
            for (const s of services) {
                // Use id first (from adapters), fallback to code (from DB lookups)
                const serviceCode = s.id || s.code
                if (!serviceCode) continue

                // Add to maps
                serviceMap.set(serviceCode, s.name)
                serviceMap.set(serviceCode.toLowerCase(), s.name)
                if (s.iconUrl) {
                    iconUrlMap.set(serviceCode, s.iconUrl)
                    iconUrlMap.set(serviceCode.toLowerCase(), s.iconUrl)
                }
                const record = await prisma.providerService.upsert({
                    where: { providerId_externalId: { providerId: provider.id, externalId: serviceCode } },
                    create: {
                        providerId: provider.id,
                        externalId: serviceCode,
                        code: serviceCode.toLowerCase(),
                        name: s.name || 'Unknown',
                        iconUrl: s.iconUrl || null,
                        lastSyncAt: new Date()
                    },
                    update: {
                        name: s.name || 'Unknown',
                        iconUrl: s.iconUrl || null,
                        lastSyncAt: new Date()
                    }
                })
                serviceIdMap.set(serviceCode, record.id)
            }

            // Update metadata sync timestamp
            await prisma.provider.update({
                where: { id: provider.id },
                data: { lastMetadataSyncAt: new Date() }
            })
        }

        // 3. Sync Prices (DEEP SEARCH ENGINE) - Always use Dynamic Engine
        console.log(`[SYNC] ${provider.name}: Starting price sync for ${countries.length} countries...`)

        // Clear existing pricing for this provider before re-indexing
        // Use raw SQL to delete reservations referencing this provider's pricing (avoids parameter limit)
        await prisma.$executeRaw`
            DELETE FROM offer_reservations 
            WHERE pricing_id IN (
                SELECT id FROM provider_pricing WHERE provider_id = ${provider.id}
            )
        `
        await prisma.providerPricing.deleteMany({ where: { providerId: provider.id } })
        await deleteOffersByProvider(provider.name)

        const allOffers: OfferDocument[] = []
        const pricingBatch: any[] = []

        // Operator mapping: Track provider+externalOperator -> internal sequential ID
        const operatorMap = new Map<string, number>()
        let operatorCounter = 1

        // User requested "super fast" but safe (120-180 req/min).
        const limiter = new RateLimitedQueue(50, 180)

        const promises = countries.map(country => limiter.add(async () => {
            try {
                const prices = await engine.getPrices(country.code)
                if (prices.length > 0) {
                    const countryDbId = countryIdMap.get(country.code)

                    const countryOffers: OfferDocument[] = prices
                        .filter(p => p.count > 0)
                        .map(p => {
                            // Robust service name lookup:
                            // 1. Try exact match
                            // 2. Try lowercase match 
                            // 3. Try ProviderService name from DB
                            // 4. Fallback to code (should log warning)
                            let svcName = serviceMap.get(p.service)
                            if (!svcName) svcName = serviceMap.get(p.service.toLowerCase())
                            if (!svcName) {
                                // Check if we have it from the provider's own service list
                                // This was populated during service upsert phase above
                                svcName = serviceMap.get(p.service) || p.service
                                // Only log if it looks like an unmapped numeric code
                                if (/^\d+$/.test(p.service)) {
                                    console.warn(`[SYNC] Service code "${p.service}" has no mapped name. Please add to ServiceLookup.`)
                                }
                            }
                            const rawPrice = Number(p.cost)
                            const sellPrice = (rawPrice * Number(provider.priceMultiplier)) + Number(provider.fixedMarkup)

                            // OPERATOR MAPPING: Generate internal sequential ID
                            const externalOp = p.operator != null ? String(p.operator) : 'default'
                            const opKey = `${provider.name}_${externalOp}`
                            if (!operatorMap.has(opKey)) {
                                operatorMap.set(opKey, operatorCounter++)
                            }
                            const internalOpId = operatorMap.get(opKey)!

                            // Prepare DB pricing record
                            const serviceDbId = serviceIdMap.get(p.service)
                            if (countryDbId && serviceDbId) {
                                pricingBatch.push({
                                    providerId: provider.id,
                                    countryId: countryDbId,
                                    serviceId: serviceDbId,
                                    operator: p.operator != null ? String(p.operator) : null,
                                    cost: rawPrice,
                                    sellPrice: Number(sellPrice.toFixed(2)),
                                    stock: p.count,
                                    lastSyncAt: new Date()
                                })
                            }

                            // Include operator in ID to make each offer unique per operator
                            return {
                                id: `${provider.name}_${p.country}_${p.service}_${externalOp}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                                provider: provider.name,
                                displayName: provider.displayName,
                                countryCode: p.country,
                                countryName: country.name || 'Unknown',
                                flagUrl: country.flagUrl || '',
                                serviceSlug: p.service.toLowerCase(),
                                serviceName: svcName,
                                iconUrl: iconUrlMap.get(p.service) || iconUrlMap.get(p.service.toLowerCase()),
                                // Operator fields
                                operatorId: internalOpId,
                                externalOperator: externalOp !== 'default' ? externalOp : undefined,
                                operatorDisplayName: '', // Default empty, can be edited in admin settings
                                price: Number(sellPrice.toFixed(2)),
                                stock: p.count,
                                lastSyncedAt: Date.now()
                            }
                        })

                    if (countryOffers.length > 0) {
                        allOffers.push(...countryOffers)
                        pricesCount += countryOffers.length
                    }
                }
            } catch (e) {
                console.warn(`[SYNC] Failed to fetch prices for ${country.code}:`, e)
            }
        }))

        await Promise.all(promises)

        // Batch insert pricing to DB (in chunks to avoid memory issues)
        if (pricingBatch.length > 0) {
            console.log(`[SYNC] ${provider.name}: Inserting ${pricingBatch.length} pricing records to DB...`)
            const chunkSize = 1000
            for (let i = 0; i < pricingBatch.length; i += chunkSize) {
                const chunk = pricingBatch.slice(i, i + chunkSize)
                await prisma.providerPricing.createMany({ data: chunk, skipDuplicates: true })
            }
        }

        // Index to MeiliSearch for fast text search
        if (allOffers.length > 0) {
            await indexOffers(allOffers)
        }

    } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
        console.error(`[SYNC] Dynamic ${provider.name} error:`, error)
    }

    // Update final status
    await prisma.provider.update({
        where: { id: provider.id },
        data: {
            syncStatus: error ? 'failed' : 'success',
            lastSyncAt: new Date(),
            syncCount: { increment: 1 }
        }
    })

    return { provider: provider.name, countries: countriesCount, services: servicesCount, prices: pricesCount, error, duration: Date.now() - startTime }
}


// ============================================
// MAIN EXPORTS
// ============================================

export async function syncProviderData(providerName: string): Promise<SyncResult> {
    const provider = await prisma.provider.findUnique({ where: { name: providerName } })
    if (provider) {
        return await syncDynamic(provider)
    } else {
        throw new Error(`Provider ${providerName} not found via DB`)
    }
}

export async function syncAllProviders(): Promise<SyncResult[]> {
    console.log(`[SYNC] Starting full sync at ${new Date().toISOString()}`)
    const results: SyncResult[] = []
    const providers = await prisma.provider.findMany({ where: { isActive: true } })
    for (const provider of providers) {
        try {
            const result = await syncProviderData(provider.name)
            results.push(result)
        } catch (e) {
            console.error(`[SYNC] Failed to sync ${provider.name}:`, e)
        }
    }

    // Refresh precomputed aggregates for fast list responses
    console.log(`[SYNC] Refreshing service aggregates...`)
    try {
        await refreshAllServiceAggregates()
    } catch (e) {
        console.error(`[SYNC] Failed to refresh aggregates:`, e)
    }

    console.log(`[SYNC] Full sync completed`)
    return results
}

export async function isSyncNeeded(): Promise<boolean> {
    const lastSync = await prisma.auditLog.findFirst({
        where: { action: 'SYNC_TRIGGERED' },
        orderBy: { createdAt: 'desc' }
    })
    if (!lastSync) return true
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)
    return lastSync.createdAt < twelveHoursAgo
}

export async function getLastSyncInfo() {
    const jobs = await prisma.auditLog.findMany({ where: { action: 'SYNC_TRIGGERED' }, orderBy: { createdAt: 'desc' }, take: 10 })
    const countriesCount = await prisma.countryLookup.count()
    const servicesCount = await prisma.serviceLookup.count()
    return { recentJobs: jobs, activeCountries: countriesCount, activeServices: servicesCount }
}

let syncIntervalId: NodeJS.Timeout | null = null
export function startSyncScheduler() {
    if (syncIntervalId) return
    console.log('[SYNC] Starting scheduler (every 12 hours)')
    syncAllProviders().catch(console.error)
    syncIntervalId = setInterval(() => syncAllProviders().catch(console.error), 12 * 60 * 60 * 1000)
}

export function stopSyncScheduler() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId)
        syncIntervalId = null
    }
}

