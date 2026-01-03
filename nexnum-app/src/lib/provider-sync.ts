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
import { normalizeCountryEntry } from './country-normalizer'
import { logAdminAction } from './auditLog'
import * as dotenv from 'dotenv'
dotenv.config()
import { RateLimitedQueue } from './async-utils'

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

// GrizzlySMS Types
interface GrizzlyCountry { id: number; name: string; phone_code: string; slug: string; icon: string; iso?: string }
interface GrizzlyService { id: number; name: string; slug: string; icon: string | number | null }

// 5sim Types
interface FiveSimCountriesResponse { [countryName: string]: { iso: { [key: string]: number }; prefix: { [key: string]: number }; text_en: string } }
interface FiveSimProductsResponse { [serviceCode: string]: { Category: string; Qty: number; Price: number } }

// ============================================
// CONFIG
// ============================================

const PROVIDERS_CONFIG = {
    grizzlysms: { baseUrl: 'https://grizzlysms.com/api', apiKeyEnv: 'GRIZZLYSMS_API_KEY' },
    herosms: { baseUrl: 'https://hero-sms.com/stubs/handler_api.php', apiKeyEnv: 'HERO_SMS_API_KEY' },
    '5sim': { baseUrl: 'https://5sim.net/v1', apiKeyEnv: 'FIVESIM_API_KEY' },
    smsbower: { baseUrl: 'https://smsbower.online/stubs/handler_api.php', apiKeyEnv: 'SMSBOWER_API_KEY' }
} as const

// Providers that use legacy logic for metadata fetching
const LEGACY_METADATA_PROVIDERS = ['5sim', 'grizzlysms', 'herosms', 'smsbower']

// ============================================
// HELPERS
// ============================================

const limit = pLimit(10) // Limit DB upserts concurrency
const apiLimit = pLimit(5) // Limit API concurrency

async function upsertCountryLookup(code: string, name: string, phoneCode: string, flagUrl?: string | null) {
    // In strict batching we would use createMany, but for mixed updates/creates on conflict:
    // We stick to upsert but run reliably in parallel
    try {
        await prisma.countryLookup.upsert({
            where: { code },
            create: { code, name, phoneCode, flagUrl: flagUrl || null },
            update: { name, phoneCode, flagUrl: flagUrl || undefined }
        })
    } catch (e) {
        // Suppress unique constraint race conditions if multiple threads hit same ID
        // console.warn(`[SYNC] Failed to upsert country lookup for ${code}`, e)
    }
}

async function upsertServiceLookup(code: string, name: string, iconUrl?: string | null) {
    try {
        await prisma.serviceLookup.upsert({
            where: { code },
            create: { code, name, iconUrl: iconUrl || null },
            update: { name, iconUrl: iconUrl || undefined }
        })
    } catch (e) {
        // console.warn(`[SYNC] Failed to upsert service lookup for ${code}`, e)
    }
}

// ============================================
// LEGACY FETCHERS (Hybrid Strategy)
// ============================================

async function getCountriesLegacy(provider: Provider, engine: DynamicProvider): Promise<{ code: string, name: string, phoneCode: string, flag?: string | null }[]> {
    const slug = provider.name.toLowerCase()

    // 5SIM
    if (slug === '5sim') {
        const res = await fetch(`${PROVIDERS_CONFIG['5sim'].baseUrl}/guest/countries`)
        const data: FiveSimCountriesResponse = await res.json()
        const results = []

        await Promise.all(Object.entries(data).map(([name, d]) => limit(async () => {
            const prefix = Object.keys(d.prefix || {})[0] || ''
            const norm = normalizeCountryEntry(d.text_en || name, prefix)
            await upsertCountryLookup(norm.canonical, norm.displayName, norm.phoneCode)
            results.push({ code: norm.canonical, name: norm.displayName, phoneCode: norm.phoneCode })
        })))
        return results
    }

    // GRIZZLY SMS
    if (slug === 'grizzlysms') {
        const res = await fetch(`${PROVIDERS_CONFIG.grizzlysms.baseUrl}/country`)
        const data: GrizzlyCountry[] = await res.json()
        const results = []
        for (const c of data) {
            const providerCode = c.iso || c.id
            if (!providerCode) continue // Strict: Skip if no code/ID

            const norm = normalizeCountryEntry(c.name, c.phone_code)
            const finalCode = String(providerCode).toLowerCase()

            await upsertCountryLookup(finalCode, norm.displayName, norm.phoneCode, c.icon)
            results.push({ code: finalCode, name: norm.displayName, phoneCode: norm.phoneCode, flag: c.icon })
        }
        return results
    }



    // HEROSMS
    if (slug === 'herosms') {
        const apiKey = process.env.HERO_SMS_API_KEY
        const res = await fetch(`${PROVIDERS_CONFIG.herosms.baseUrl}?api_key=${apiKey}&action=getCountries&lang=en`)
        const data = await res.json()
        const list = Array.isArray(data.countries || data) ? (data.countries || data) : Object.values(data.countries || data)
        const results = []
        for (const c of list as any[]) {
            const providerCode = c.iso || c.country_code || c.id
            if (!providerCode) continue // Strict: Skip if no code/ID

            const name = c.eng || c.name || 'Unknown'
            const norm = normalizeCountryEntry(name, c.prefix || c.code)
            const finalCode = String(providerCode).toLowerCase()

            await upsertCountryLookup(finalCode, norm.displayName, norm.phoneCode)
            results.push({ code: finalCode, name: norm.displayName, phoneCode: norm.phoneCode })
        }
        return results
    }

    // SMSBOWER
    if (slug === 'smsbower') {
        const apiKey = process.env.SMSBOWER_API_KEY
        const res = await fetch(`${PROVIDERS_CONFIG.smsbower.baseUrl}?api_key=${apiKey}&action=getCountries`)
        const data = await res.json()
        const list = Array.isArray(data) ? data : Object.values(data)
        const results = []
        for (const c of list as any[]) {
            // Prioritize ISO code or explicit code from provider for the API key "code"
            // SMS-Activate clones often return "iso" (e.g. "us", "ru") or "id"
            const providerCode = c.iso || c.code || c.id
            if (!providerCode) continue // Strict: Skip if no code/ID

            const norm = normalizeCountryEntry(c.eng || c.rus || 'Unknown', '')

            const finalCode = String(providerCode).toLowerCase()

            await upsertCountryLookup(finalCode, norm.displayName, norm.phoneCode)
            results.push({ code: finalCode, name: norm.displayName, phoneCode: norm.phoneCode })
        }
        return results
    }

    // Fallback to Dynamic Engine
    const dynamicCountries = await engine.getCountries()
    return dynamicCountries.map(c => ({
        code: c.code,
        name: c.name,
        phoneCode: c.phoneCode || '',
        flag: c.flag
    }))
}

async function getServicesLegacy(provider: Provider, engine: DynamicProvider): Promise<void> {
    const slug = provider.name.toLowerCase()

    // 5SIM
    if (slug === '5sim') {
        const res = await fetch(`${PROVIDERS_CONFIG['5sim'].baseUrl}/guest/products/any/any`)
        const data: FiveSimProductsResponse = await res.json()
        await Promise.all(Object.keys(data).map(code => limit(async () => {
            const name = code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            await upsertServiceLookup(code.toLowerCase(), name)
        })))
        return
    }

    // GRIZZLY SMS
    if (slug === 'grizzlysms') {
        // Grizzly paging is sequential by nature, but upserts can be parallel
        let page = 1; let hasMore = true; const seen = new Set<number>()
        while (hasMore) {
            const res = await fetch(`${PROVIDERS_CONFIG.grizzlysms.baseUrl}/service?page=${page}&lang=en`)
            const data: GrizzlyService[] = await res.json()
            if (!data || data.length === 0) break
            const newItems = data.filter(s => !seen.has(s.id))
            if (newItems.length === 0) break
            newItems.forEach(s => seen.add(s.id))

            await Promise.all(newItems.map(s => limit(async () => {
                await upsertServiceLookup(s.slug.toLowerCase(), s.name, s.icon ? String(s.icon) : null)
            })))
            page++; if (page > 30) break
        }
        return
    }

    // HEROSMS
    if (slug === 'herosms') {
        const apiKey = process.env.HERO_SMS_API_KEY
        const res = await fetch(`${PROVIDERS_CONFIG.herosms.baseUrl}?api_key=${apiKey}&action=getServicesList&lang=en`)
        const data = await res.json()
        await Promise.all(((data.services || []) as any[]).map(s => limit(async () => {
            await upsertServiceLookup(s.code.toLowerCase(), s.name)
        })))
        return
    }

    // SMSBOWER
    if (slug === 'smsbower') {
        const res = await fetch(`https://smsbower.org/activations/getPricesByService?serviceId=5&withPopular=true`, { headers: { 'Accept': 'application/json' } })
        const json = await res.json()
        const list = Array.isArray(json.services) ? json.services : Object.values(json.services || {})
        await Promise.all((list as any[]).map(s => limit(async () => {
            let iconUrl = s.img_path
            if (iconUrl && !iconUrl.startsWith('http')) iconUrl = `https://smsbower.org${iconUrl}`
            await upsertServiceLookup((s.activate_org_code || s.slug).toLowerCase(), s.title, iconUrl)
        })))
        return
    }

    // Fallback: Use Dynamic, but we iterate differently in syncDynamic usually.
    // For standard providers, we usually get services per country or via engine.getServices().
    // The legacy function only populates lookup.
    // We'll let syncDynamic handle the fallback logic if not matched here.
}


// ============================================
// DYNAMIC SYNC (UNIFIED)
// ============================================

async function syncDynamic(provider: Provider): Promise<SyncResult> {
    const startTime = Date.now()
    let countriesCount = 0, servicesCount = 0, pricesCount = 0, error: string | undefined
    const serviceMap = new Map<string, string>()

    try {
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
                select: { id: true, externalId: true, name: true, phoneCode: true }
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
                    countries.push({ code: c.externalId, name: c.name, phoneCode: c.phoneCode })
                })
                countriesCount = dbCountries.length

                const dbServices = await prisma.providerService.findMany({
                    where: { providerId: provider.id },
                    select: { id: true, externalId: true, name: true }
                })
                dbServices.forEach(s => {
                    serviceIdMap.set(s.externalId, s.id)
                    serviceMap.set(s.externalId, s.name)
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
                        phoneCode: c.phoneCode || null,
                        flagUrl: c.flag || null,
                        lastSyncAt: new Date()
                    },
                    update: {
                        name: c.name || 'Unknown',
                        phoneCode: c.phoneCode || null,
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
                services = dbServices.map(s => ({ code: s.code, name: s.name, icon: s.iconUrl }))
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
                serviceMap.set(s.code, s.name)
                const record = await prisma.providerService.upsert({
                    where: { providerId_externalId: { providerId: provider.id, externalId: s.code } },
                    create: {
                        providerId: provider.id,
                        externalId: s.code,
                        code: s.code.toLowerCase(),
                        name: s.name || 'Unknown',
                        iconUrl: s.icon || null,
                        lastSyncAt: new Date()
                    },
                    update: {
                        name: s.name || 'Unknown',
                        iconUrl: s.icon || null,
                        lastSyncAt: new Date()
                    }
                })
                serviceIdMap.set(s.code, record.id)
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
        await prisma.providerPricing.deleteMany({ where: { providerId: provider.id } })
        await deleteOffersByProvider(provider.name)

        const allOffers: OfferDocument[] = []
        const pricingBatch: any[] = []

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
                            const svcName = serviceMap.get(p.service) || p.service
                            const rawPrice = Number(p.cost)
                            const sellPrice = (rawPrice * Number(provider.priceMultiplier)) + Number(provider.fixedMarkup)

                            // Prepare DB pricing record
                            const serviceDbId = serviceIdMap.get(p.service)
                            if (countryDbId && serviceDbId) {
                                pricingBatch.push({
                                    providerId: provider.id,
                                    countryId: countryDbId,
                                    serviceId: serviceDbId,
                                    operator: p.operator || null,
                                    cost: rawPrice,
                                    sellPrice: Number(sellPrice.toFixed(2)),
                                    stock: p.count,
                                    lastSyncAt: new Date()
                                })
                            }

                            return {
                                id: `${provider.name}_${p.country}_${p.service}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                                provider: provider.name,
                                displayName: provider.displayName,
                                countryCode: p.country,
                                countryName: country.name || 'Unknown',
                                phoneCode: country.phoneCode || '',
                                flagUrl: country.flag || '',
                                serviceSlug: p.service.toLowerCase(),
                                serviceName: svcName,
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
