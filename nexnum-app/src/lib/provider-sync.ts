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

        // METADATA CACHING (24h Rule)
        let countries: any[] = []
        let services: any[] = []
        let skipMetadataSync = false

        if (provider.lastMetadataSyncAt && provider.cachedCountries) {
            const hoursSince = (Date.now() - provider.lastMetadataSyncAt.getTime()) / (1000 * 60 * 60)
            if (hoursSince < 24) {
                console.log(`[SYNC] ${provider.name}: Using cached metadata (${hoursSince.toFixed(1)}h old)`)
                skipMetadataSync = true
                countries = provider.cachedCountries as any[]
                // Load cached services if available
                if (provider.cachedServices) {
                    services = provider.cachedServices as any[]
                    // Re-populate memory map
                    services.forEach(s => serviceMap.set(s.code, s.name))
                }

                // VALIDATION: Check for legacy cache (codes identical to names or having spaces, e.g., "United States")
                // We want strict ISO codes (e.g. "us", "ru") or IDs ("187").
                // If we detect "United States" as a code, invalidate.
                const isLegacyCache = countries.some(c => c.code.includes(' ') || c.code.length > 5)
                if (isLegacyCache) {
                    console.log(`[SYNC] ${provider.name}: Cache validation failed (legacy formats detected). Forcing fresh fetch...`)
                    skipMetadataSync = false
                    countries = []
                    services = []
                    serviceMap.clear()
                }
            }
        }

        if (!skipMetadataSync) {
            console.log(`[SYNC] ${provider.name}: Fetching fresh metadata...`)
            if (!useDynamicMetadata && LEGACY_METADATA_PROVIDERS.includes(provider.name.toLowerCase())) {
                countries = await getCountriesLegacy(provider, engine)
            } else {
                countries = await engine.getCountries()
            }
            countriesCount = countries.length

            // 2. Services (Hybrid: Legacy or Dynamic Logic)
            if (!useDynamicMetadata && LEGACY_METADATA_PROVIDERS.includes(provider.name.toLowerCase())) {
                await getServicesLegacy(provider, engine)
            } else {
                // Dynamic Logic
                try {
                    services = await engine.getServices('')
                } catch (e) {
                    try {
                        services = await engine.getServices('us')
                    } catch (e2) {
                        if (countries.length > 0) services = await engine.getServices(countries[0].code)
                    }
                }
                if (services.length > 0) {
                    await Promise.all(services.map(s => limit(async () => {
                        serviceMap.set(s.code, s.name)
                        await upsertServiceLookup(s.code.toLowerCase(), s.name, s.icon)
                    })))
                    servicesCount = services.length
                }
            }

            // Update Cache & Timestamp
            await prisma.provider.update({
                where: { id: provider.id },
                data: {
                    lastMetadataSyncAt: new Date(),
                    cachedCountries: countries,
                    cachedServices: services
                }
            })
        } else {
            // Using cached - just populate stats
            countriesCount = countries.length
            servicesCount = services.length
        }
        // 3. Sync Prices (DEEP SEARCH ENGINE) - Always use Dynamic Engine
        console.log(`[SYNC] ${provider.name}: Starting price sync for ${countries.length} countries...`)

        // Clear existing offers for this provider before re-indexing
        await deleteOffersByProvider(provider.name)

        const allOffers: OfferDocument[] = []

        // User requested "super fast" but safe (120-180 req/min).
        // 180 req/min = 3 req/sec.
        // We allow high concurrency (e.g. 50 parallel connections) so we never block on latency,
        // but the Queue strictly enforces the 3 req/sec launch rate.
        const limiter = new RateLimitedQueue(50, 180)

        const promises = countries.map(country => limiter.add(async () => {
            try {
                const prices = await engine.getPrices(country.code)
                if (prices.length > 0) {
                    const normCountry = normalizeCountryEntry(country.code)

                    const countryOffers: OfferDocument[] = prices
                        .filter(p => p.count > 0)
                        .map(p => {
                            // Try to resolve service name from map or DB or fallback
                            const svcName = serviceMap.get(p.service) || p.service
                            // Apply pricing margins
                            const rawPrice = Number(p.cost)
                            const sellPrice = (rawPrice * Number(provider.priceMultiplier)) + Number(provider.fixedMarkup)

                            return {
                                id: `${provider.name}_${p.country}_${p.service}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                                provider: provider.name,
                                displayName: provider.displayName,
                                countryCode: p.country,
                                countryName: normCountry.displayName,
                                phoneCode: normCountry.phoneCode,
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


        // Final Batch index
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
