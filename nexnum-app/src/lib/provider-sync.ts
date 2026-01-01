/**
 * Provider Data Sync - Countries & Services Only
 * 
 * Fetches country and service data from SMS providers every 12 hours.
 * Pricing is handled separately at purchase time via real-time API calls.
 * 
 * Supported Providers:
 * - Generic Dynamic Providers (Database Configured)
 * - Legacy Fallback: GrizzlySMS, OnlineSIM, HeroSMS, 5sim, SMSBower
 */

import { prisma } from './db'
import { Provider } from '@prisma/client'
import { DynamicProvider } from './dynamic-provider'

// ============================================
// TYPES
// ============================================

interface SyncResult {
    provider: string
    countries: number
    services: number
    error?: string
    duration: number
}

// GrizzlySMS
interface GrizzlyCountry {
    id: number
    name: string
    phone_code: string
    slug: string
    icon: string
}

interface GrizzlyService {
    id: number
    name: string
    short_name?: string
    external_id?: string
    slug: string
    icon: string | number | null
}

// 5sim
interface FiveSimCountriesResponse {
    [countryName: string]: {
        iso: { [key: string]: number }
        prefix: { [key: string]: number }
        text_en: string
    }
}

interface FiveSimProductsResponse {
    [serviceCode: string]: { Category: string; Qty: number; Price: number }
}

// SMSBower
interface SmsBowerCountry {
    id: number
    rus: string
    eng: string
}

interface SmsBowerService {
    id: number
    title: string
    sender_title: string | null
    activate_org_code: string
    slug: string
    sms_pattern: string | null
    is_active: number
    img_path: string
}

// HeroSMS
interface HeroCountry { id: number | string; name: string; iso: string; prefix: string }
interface HeroService { id: number | string; name: string; code: string }

// Country code to name mapping
const COUNTRY_CODE_MAP: Record<string, { name: string; phoneCode: string }> = {
    '7': { name: 'Russia', phoneCode: '7' },
    '1': { name: 'United States', phoneCode: '1' },
    '44': { name: 'United Kingdom', phoneCode: '44' },
    '91': { name: 'India', phoneCode: '91' },
    '49': { name: 'Germany', phoneCode: '49' },
    '33': { name: 'France', phoneCode: '33' },
    '86': { name: 'China', phoneCode: '86' },
    '55': { name: 'Brazil', phoneCode: '55' },
    '62': { name: 'Indonesia', phoneCode: '62' },
    '84': { name: 'Vietnam', phoneCode: '84' },
    '63': { name: 'Philippines', phoneCode: '63' },
    '380': { name: 'Ukraine', phoneCode: '380' },
    '48': { name: 'Poland', phoneCode: '48' },
    '90': { name: 'Turkey', phoneCode: '90' },
    '34': { name: 'Spain', phoneCode: '34' },
    '39': { name: 'Italy', phoneCode: '39' },
    '31': { name: 'Netherlands', phoneCode: '31' },
    '61': { name: 'Australia', phoneCode: '61' },
    '81': { name: 'Japan', phoneCode: '81' },
    '82': { name: 'South Korea', phoneCode: '82' },
}

// ============================================
// PROVIDER CONFIGS
// ============================================

const PROVIDERS = {
    grizzlysms: {
        name: 'GrizzlySMS',
        baseUrl: 'https://grizzlysms.com/api',
        apiKeyEnv: 'GRIZZLYSMS_API_KEY'
    },
    onlinesim: {
        name: 'OnlineSIM',
        baseUrl: 'https://onlinesim.io/api',
        apiKeyEnv: 'ONLINESIM_API_KEY'
    },
    herosms: {
        name: 'HeroSMS',
        baseUrl: 'https://hero-sms.com/stubs/handler_api.php',
        apiKeyEnv: 'HERO_SMS_API_KEY'
    },
    '5sim': {
        name: '5sim',
        baseUrl: 'https://5sim.net/v1',
        apiKeyEnv: 'FIVESIM_API_KEY'
    },
    smsbower: {
        name: 'SMSBower',
        baseUrl: 'https://smsbower.online/stubs/handler_api.php',
        apiKeyEnv: 'SMSBOWER_API_KEY'
    }
} as const

type ProviderKey = keyof typeof PROVIDERS

/**
 * BUILT-IN PROVIDERS
 * 
 * These providers have specialized/optimized legacy sync functions.
 * Add new provider slugs here (lowercase) if you want to use legacy sync for them.
 * Otherwise, new providers added via admin panel will use DynamicProvider automatically.
 * 
 * To add a new built-in provider:
 * 1. Add the slug here (lowercase)
 * 2. Create a sync function (e.g., syncNewProvider())
 * 3. Add a case in the switch statement in syncProviderData()
 */
const BUILTIN_PROVIDERS: string[] = [
    '5sim',
    'grizzlysms',
    'onlinesim',
    'herosms',
    'smsbower',
    // Add new built-in providers here:
    // 'newprovider',
]

// ============================================
// SYNC FUNCTIONS
// ============================================

// Helper for batch processing
async function processInBatches<T>(items: T[], batchSize: number, iterator: (item: T) => Promise<any>): Promise<void> {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        await Promise.all(batch.map(item => iterator(item)))
    }
}

// --- Dynamic Sync Implementation ---

async function syncDynamic(provider: Provider): Promise<SyncResult> {
    const startTime = Date.now()
    let countriesCount = 0, servicesCount = 0, error: string | undefined

    try {
        const engine = new DynamicProvider(provider)

        // 1. Countries
        const countries = await engine.getCountries()
        await processInBatches(countries, 50, async (c) => {
            const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            await prisma.country.upsert({
                where: { externalId_provider: { externalId: c.id, provider: provider.name } },
                create: {
                    externalId: c.id,
                    name: c.name,
                    slug,
                    phoneCode: c.phoneCode || '',
                    iconUrl: c.flag || null,
                    provider: provider.name,
                    isActive: true,
                    lastSyncedAt: new Date()
                },
                update: {
                    name: c.name,
                    phoneCode: c.phoneCode || undefined,
                    isActive: true,
                    lastSyncedAt: new Date()
                }
            })
            countriesCount++
        })

        // 2. Services
        // Strategy: Try empty (all services), then 'us', then first country code
        let services: any[] = []
        try {
            if (provider.name === '5sim' || provider.name === 'grizzlysms') {
                services = await engine.getServices('any')
            } else {
                // Try empty first (many APIs return all services with no country filter)
                try {
                    services = await engine.getServices('')
                    console.log(`[SYNC] ${provider.name}: Got ${services.length} services with empty country`)
                } catch (e1) {
                    // Try 'us' as fallback
                    try {
                        services = await engine.getServices('us')
                    } catch (e2) {
                        // Try first country found
                        if (countries.length > 0) {
                            services = await engine.getServices(countries[0].code)
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`[SYNC] Failed to fetch services for ${provider.name}`, e)
        }

        if (services.length > 0) {
            await processInBatches(services, 50, async (s) => {
                const slug = s.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                await prisma.service.upsert({
                    where: { externalId_provider: { externalId: s.code, provider: provider.name } },
                    create: {
                        externalId: s.code,
                        name: s.name,
                        slug,
                        shortName: s.code,
                        provider: provider.name,
                        isActive: true,
                        lastSyncedAt: new Date()
                    },
                    update: {
                        name: s.name,
                        isActive: true,
                        lastSyncedAt: new Date()
                    }
                })
                servicesCount++
            })
        }

    } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
        console.error(`[SYNC] Dynamic ${provider.name} error:`, error)
    }

    return { provider: provider.name, countries: countriesCount, services: servicesCount, error, duration: Date.now() - startTime }
}


// --- Legacy Sync Functions ---

async function syncGrizzlySMS(): Promise<SyncResult> {
    const startTime = Date.now()
    const provider = 'grizzlysms'
    let countries = 0, services = 0, error: string | undefined

    try {
        const countryRes = await fetch(`${PROVIDERS.grizzlysms.baseUrl}/country`)
        const countryData: GrizzlyCountry[] = await countryRes.json()

        await processInBatches(countryData, 50, async (c) => {
            await prisma.country.upsert({
                where: { externalId_provider: { externalId: String(c.id), provider } },
                create: {
                    externalId: String(c.id),
                    name: c.name,
                    slug: c.slug,
                    phoneCode: c.phone_code,
                    iconUrl: c.icon,
                    provider,
                    isActive: true,
                    lastSyncedAt: new Date()
                },
                update: {
                    name: c.name,
                    phoneCode: c.phone_code,
                    isActive: true,
                    lastSyncedAt: new Date()
                }
            })
            countries++
        })

        let page = 1
        let hasMore = true
        const seenIds = new Set<number>()

        while (hasMore) {
            const serviceRes = await fetch(`${PROVIDERS.grizzlysms.baseUrl}/service?page=${page}&lang=en`)
            const serviceData: GrizzlyService[] = await serviceRes.json()

            if (!serviceData || serviceData.length === 0) {
                hasMore = false
                break
            }

            const newServices = serviceData.filter(s => !seenIds.has(s.id))
            if (newServices.length === 0) {
                hasMore = false
                break
            }

            serviceData.forEach(s => seenIds.add(s.id))

            await processInBatches(newServices, 50, async (s) => {
                const shortName = s.short_name || s.external_id || s.slug
                await prisma.service.upsert({
                    where: { externalId_provider: { externalId: String(s.id), provider } },
                    create: {
                        externalId: String(s.id),
                        name: s.name,
                        slug: s.slug,
                        shortName: shortName,
                        iconUrl: s.icon ? String(s.icon) : null,
                        provider,
                        isActive: true,
                        lastSyncedAt: new Date()
                    },
                    update: {
                        name: s.name,
                        shortName: shortName,
                        isActive: true,
                        lastSyncedAt: new Date()
                    }
                })
                services++
            })
            page++
            if (page > 100) break
        }
        console.log(`[SYNC] GrizzlySMS: ${countries} countries, ${services} services (${page - 1} pages)`)
    } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
        console.error('[SYNC] GrizzlySMS error:', error)
    }
    return { provider, countries, services, error, duration: Date.now() - startTime }
}

async function syncOnlineSIM(): Promise<SyncResult> {
    const startTime = Date.now()
    const provider = 'onlinesim'
    let countries = 0, services = 0, error: string | undefined

    try {
        const apiKey = process.env.ONLINESIM_API_KEY
        let page = 1
        let hasMore = true

        while (hasMore) {
            const url = `${PROVIDERS.onlinesim.baseUrl}/getTariffs.php?lang=en&page=${page}${apiKey ? `&apikey=${apiKey}` : ''}`
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
            const data = await res.json()

            if (String(data.response) !== '1') {
                if (page === 1) throw new Error(JSON.stringify(data.response) || 'API Error')
                break
            }

            if (page === 1) {
                const apiCountries = data.countries || {}
                const countryList = Object.entries(apiCountries) as [string, any][]

                await processInBatches(countryList, 50, async ([key, c]) => {
                    const countryCode = String(c.code)
                    const name = c.name || c.original
                    await prisma.country.upsert({
                        where: { externalId_provider: { externalId: countryCode, provider } },
                        create: {
                            externalId: countryCode,
                            name: name,
                            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                            phoneCode: countryCode,
                            provider,
                            isActive: c.enable !== false,
                            lastSyncedAt: new Date()
                        },
                        update: { name: name, isActive: c.enable !== false, lastSyncedAt: new Date() }
                    })
                    countries++
                })
            }

            const apiServices = data.services || {}
            const serviceList = Object.entries(apiServices) as [string, any][]

            if (serviceList.length === 0) {
                hasMore = false
                break
            }

            await processInBatches(serviceList, 50, async ([key, s]) => {
                await prisma.service.upsert({
                    where: { externalId_provider: { externalId: s.slug, provider } },
                    create: {
                        externalId: s.slug,
                        name: s.service,
                        slug: s.slug,
                        shortName: s.slug,
                        provider,
                        isActive: true,
                        lastSyncedAt: new Date()
                    },
                    update: { name: s.service, isActive: true, lastSyncedAt: new Date() }
                })
                services++
            })
            if (page > 50) break
            page++
            await new Promise(r => setTimeout(r, 500))
        }
        console.log(`[SYNC] OnlineSIM: ${countries} countries, ${services} services`)
    } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
        console.error('[SYNC] OnlineSIM error:', error)
    }
    return { provider, countries, services, error, duration: Date.now() - startTime }
}

async function syncHeroSMS(): Promise<SyncResult> {
    const startTime = Date.now()
    const provider = 'herosms'
    let countries = 0, services = 0, error: string | undefined

    try {
        const apiKey = process.env.HERO_SMS_API_KEY
        if (!apiKey) throw new Error('HERO_SMS_API_KEY not set')

        const countryUrl = `${PROVIDERS.herosms.baseUrl}?api_key=${apiKey}&action=getCountries&lang=en`
        const countryRes = await fetch(countryUrl)
        const countryText = await countryRes.text()
        let countryData: any
        try { countryData = JSON.parse(countryText) } catch (e) { throw new Error(`HeroSMS getCountries parse error`) }

        const activeCountries = countryData.countries || countryData
        const countriesList = Array.isArray(activeCountries) ? activeCountries : Object.values(activeCountries)

        await processInBatches(countriesList as any[], 50, async (c) => {
            if (!c.id) return
            const name = c.eng || c.name || c.original || 'Unknown'
            let phoneCode = c.prefix || c.code || ''
            if (!phoneCode) {
                const found = Object.values(COUNTRY_CODE_MAP).find(val => val.name.toLowerCase() === name.toLowerCase())
                if (found) phoneCode = found.phoneCode
            }
            await prisma.country.upsert({
                where: { externalId_provider: { externalId: String(c.id), provider } },
                create: {
                    externalId: String(c.id),
                    name: name,
                    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    phoneCode: phoneCode,
                    provider,
                    isActive: true,
                    lastSyncedAt: new Date()
                },
                update: { name: name, phoneCode: phoneCode, isActive: true, lastSyncedAt: new Date() }
            })
            countries++
        })

        const serviceUrl = `${PROVIDERS.herosms.baseUrl}?api_key=${apiKey}&action=getServicesList&lang=en`
        const serviceRes = await fetch(serviceUrl)
        const serviceText = await serviceRes.text()
        let serviceData: any
        try { serviceData = JSON.parse(serviceText) } catch (e) { throw new Error(`HeroSMS getServicesList parse error`) }

        const servicesList = serviceData.services || []
        await processInBatches(servicesList as any[], 50, async (s) => {
            if (!s.code) return
            await prisma.service.upsert({
                where: { externalId_provider: { externalId: s.code, provider } },
                create: {
                    externalId: s.code,
                    name: s.name,
                    slug: s.code.toLowerCase(),
                    shortName: s.code,
                    provider,
                    isActive: true,
                    lastSyncedAt: new Date()
                },
                update: { name: s.name, isActive: true, lastSyncedAt: new Date() }
            })
            services++
        })
        console.log(`[SYNC] HeroSMS: ${countries} countries, ${services} services`)
    } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
        console.error('[SYNC] HeroSMS error:', error)
    }
    return { provider, countries, services, error, duration: Date.now() - startTime }
}

async function sync5Sim(): Promise<SyncResult> {
    const startTime = Date.now()
    const provider = '5sim'
    let countries = 0, services = 0, error: string | undefined
    try {
        const countryRes = await fetch(`${PROVIDERS['5sim'].baseUrl}/guest/countries`)
        const countryData: FiveSimCountriesResponse = await countryRes.json()
        const countryList = Object.entries(countryData)
        await processInBatches(countryList, 50, async ([countryName, data]) => {
            const iso = Object.keys(data.iso || {})[0] || countryName
            const prefix = Object.keys(data.prefix || {})[0] || ''
            await prisma.country.upsert({
                where: { externalId_provider: { externalId: iso, provider } },
                create: {
                    externalId: iso,
                    name: data.text_en || countryName,
                    slug: countryName.toLowerCase().replace(/\s+/g, '-'),
                    phoneCode: prefix.replace('+', ''),
                    provider,
                    isActive: true,
                    lastSyncedAt: new Date()
                },
                update: { name: data.text_en || countryName, isActive: true, lastSyncedAt: new Date() }
            })
            countries++
        })
        const serviceRes = await fetch(`${PROVIDERS['5sim'].baseUrl}/guest/products/any/any`)
        const serviceData: FiveSimProductsResponse = await serviceRes.json()
        const serviceList = Object.keys(serviceData)
        await processInBatches(serviceList, 50, async (serviceCode) => {
            const name = serviceCode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            await prisma.service.upsert({
                where: { externalId_provider: { externalId: serviceCode, provider } },
                create: {
                    externalId: serviceCode,
                    name,
                    slug: serviceCode.toLowerCase(),
                    shortName: serviceCode,
                    provider,
                    isActive: true,
                    lastSyncedAt: new Date()
                },
                update: { name, isActive: true, lastSyncedAt: new Date() }
            })
            services++
        })
        console.log(`[SYNC] 5sim: ${countries} countries, ${services} services`)
    } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
        console.error('[SYNC] 5sim error:', error)
    }
    return { provider, countries, services, error, duration: Date.now() - startTime }
}

async function syncSMSBower(): Promise<SyncResult> {
    const startTime = Date.now()
    const provider = 'smsbower'
    let countries = 0, services = 0, error: string | undefined
    try {
        const apiKey = process.env.SMSBOWER_API_KEY
        if (!apiKey) throw new Error('SMSBOWER_API_KEY not set')
        const countryRes = await fetch(`${PROVIDERS.smsbower.baseUrl}?api_key=${apiKey}&action=getCountries`)
        const countryText = await countryRes.text()
        const countryData: SmsBowerCountry[] = JSON.parse(countryText)
        const countriesList = (Array.isArray(countryData) ? countryData : Object.values(countryData)) as SmsBowerCountry[]
        await processInBatches(countriesList, 50, async (c) => {
            await prisma.country.upsert({
                where: { externalId_provider: { externalId: String(c.id), provider } },
                create: {
                    externalId: String(c.id),
                    name: c.eng || c.rus || `Country ${c.id}`,
                    slug: (c.eng || `country-${c.id}`).toLowerCase().replace(/\s+/g, '-'),
                    phoneCode: '',
                    provider,
                    isActive: true,
                    lastSyncedAt: new Date()
                },
                update: { name: c.eng || c.rus, isActive: true, lastSyncedAt: new Date() }
            })
            countries++
        })
        const serviceRes = await fetch(`https://smsbower.org/activations/getPricesByService?serviceId=5&withPopular=true`, { headers: { 'Accept': 'application/json' }, cache: 'no-store' })
        const serviceText = await serviceRes.text()
        let serviceData: SmsBowerService[] = []
        try {
            const serviceJson = JSON.parse(serviceText)
            if (serviceJson.services && typeof serviceJson.services === 'object' && !Array.isArray(serviceJson.services)) {
                serviceData = Object.values(serviceJson.services) as SmsBowerService[]
            } else if (serviceJson.services && Array.isArray(serviceJson.services)) {
                serviceData = serviceJson.services
            }
        } catch (parseError) { console.error('[SYNC] SMSBower failed parsing services', parseError) }
        await processInBatches(serviceData, 50, async (s) => {
            let iconUrl = s.img_path
            if (iconUrl && !iconUrl.startsWith('http')) iconUrl = `https://smsbower.org${iconUrl}`
            const code = s.activate_org_code || s.slug
            await prisma.service.upsert({
                where: { externalId_provider: { externalId: code, provider } },
                create: {
                    externalId: code,
                    name: s.title,
                    slug: s.slug,
                    shortName: code,
                    iconUrl: iconUrl,
                    provider,
                    isActive: s.is_active === 1,
                    lastSyncedAt: new Date()
                },
                update: { name: s.title, iconUrl, isActive: s.is_active === 1, lastSyncedAt: new Date() }
            })
        })
        services = serviceData.length
        console.log(`[SYNC] SMSBower: ${countries} countries, ${services} services`)
    } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
        console.error('[SYNC] SMSBower error:', error)
    }
    return { provider, countries, services, error, duration: Date.now() - startTime }
}

// ============================================
// MAIN EXPORTS
// ============================================

export async function syncProviderData(providerName: string): Promise<SyncResult> {
    // 1. Find provider in DB
    const provider = await prisma.provider.findUnique({ where: { name: providerName } })

    if (provider) {
        // Log start
        const job = await prisma.syncJob.create({
            data: { provider: providerName, providerId: provider.id, jobType: 'countries', status: 'running' }
        })

        let result: SyncResult

        // Built-in providers use their specialized legacy sync functions
        // (See BUILTIN_PROVIDERS constant at the top of this file)

        if (BUILTIN_PROVIDERS.includes(provider.name.toLowerCase())) {
            // Use optimized legacy sync for built-in providers
            switch (provider.name.toLowerCase()) {
                case '5sim': result = await sync5Sim(); break
                case 'grizzlysms': result = await syncGrizzlySMS(); break
                case 'onlinesim': result = await syncOnlineSIM(); break
                case 'herosms': result = await syncHeroSMS(); break
                case 'smsbower': result = await syncSMSBower(); break
                default: result = await syncDynamic(provider)
            }
        } else {
            // NEW providers added via admin panel use DynamicProvider
            console.log(`[SYNC] Using DynamicProvider for new provider: ${provider.name}`)
            result = await syncDynamic(provider)
        }

        await prisma.syncJob.update({
            where: { id: job.id },
            data: {
                status: result.error ? 'failed' : 'completed',
                itemsFound: result.countries + result.services,
                itemsSynced: result.countries + result.services,
                error: result.error,
                completedAt: new Date()
            }
        })
        return result
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
    const lastSync = await prisma.syncJob.findFirst({
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' }
    })
    if (!lastSync || !lastSync.completedAt) return true
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)
    return lastSync.completedAt < twelveHoursAgo
}

export async function getLastSyncInfo() {
    const jobs = await prisma.syncJob.findMany({
        orderBy: { startedAt: 'desc' },
        take: 10,
        include: { providerRel: { select: { displayName: true } } }
    })
    const countriesCount = await prisma.country.count({ where: { isActive: true } })
    const servicesCount = await prisma.service.count({ where: { isActive: true } })
    return { recentJobs: jobs, activeCountries: countriesCount, activeServices: servicesCount }
}

// Scheduler
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
