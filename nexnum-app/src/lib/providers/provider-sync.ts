/**
 * Provider Data Sync - Countries & Services Only
 * 
 * Fetches country and service data from SMS providers every 12 hours.
 * Pricing is handled separately at purchase time via real-time API calls.
 * 
 * Supported Providers:
 * - All providers fully integrated via separate configuration (DynamicProvider)
 * - Hybrid Mode for Built-ins: Removed. Uses Dynamic engine for all operations.
 */

import { prisma } from '@/lib/core/db'
import { Provider } from '@prisma/client'
import { DynamicProvider } from './dynamic-provider'
import fs from 'fs'
import path from 'path'
import https from 'https'
import pLimit from 'p-limit'
import { indexOffers, OfferDocument, deleteOffersByProvider, INDEXES, SHADOW_PREFIX, swapShadowToPrimary, initSearchIndexes } from '@/lib/search/search'
import { logAdminAction } from '@/lib/core/auditLog'
import * as dotenv from 'dotenv'
import { Worker } from 'worker_threads'
dotenv.config()
import { RateLimitedQueue } from '@/lib/utils/async-utils'
import { recordProviderSync } from '@/lib/metrics'

import { refreshAllServiceAggregates } from '@/lib/search/service-aggregates'
import { getCanonicalName, generateCanonicalCode, getCanonicalKey, CANONICAL_SERVICE_NAMES, CANONICAL_DISPLAY_NAMES } from '@/lib/normalizers/service-identity'
import { getCountryIsoCode, normalizeCountryName } from '@/lib/normalizers/country-normalizer'
import { getCountryFlagUrlSync } from '@/lib/normalizers/country-flags'
import { isValidImageUrl } from '@/lib/utils/utils'
import { currencyService } from '@/lib/currency/currency-service'
import crypto from 'crypto';
import { CentralRegistry } from '@/lib/normalizers/central-registry';

// ============================================
// CONSTANTS
// ============================================

// Banned hashes are now fully managed via DB (seed-banned-icons.ts)
async function getBannedHashes(): Promise<Set<string>> {
    try {
        const dbHashes = await prisma.bannedIcon.findMany({ select: { hash: true } })
        return new Set<string>(dbHashes.map((b) => b.hash))
    } catch (e) {
        // Fallback to empty if DB fails, or log error
        console.error('[SYNC] Failed to fetch banned hashes:', e)
        return new Set<string>()
    }
}

// Helper: Download image to local path with strict single-file enforcement
// Professional: Added basic header-aware caching simulation
async function downloadImageToLocal(url: string, destPath: string, bannedSet?: Set<string>): Promise<boolean> {
    const dir = path.dirname(destPath);
    const baseName = path.parse(destPath).name; // e.g., "instagram"

    // Optimization: If file exists and is recent (< 24h), skip download
    if (fs.existsSync(destPath)) {
        const stats = fs.statSync(destPath);
        const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
        if (ageHours < 24) return true;
    }

    return new Promise((resolve) => {
        try {
            https.get(url, { timeout: 10000, headers: { 'User-Agent': 'NexNum-Bot/1.0' } }, (res) => {
                const contentType = res.headers['content-type']

                if (res.statusCode === 200 && contentType) {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        const buffer = Buffer.concat(chunks);

                        // 1. Determine Extension based on Content-Type
                        let ext = '.webp'; // Default
                        if (contentType.includes('svg')) ext = '.svg';
                        else if (contentType.includes('png')) ext = '.png';
                        else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';

                        const finalPath = path.join(dir, `${baseName}${ext}`);

                        // 2. Hash Check (Banned Hashes)
                        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
                        const isBanned = (bannedSet && bannedSet.has(hash))

                        if (isBanned) {
                            console.log(`[ICON_BANNED] Hash match for ${baseName} (${hash}). Ignoring.`);
                            resolve(false);
                            return;
                        }

                        // 3. STRICT CLEANUP: Remove ANY other extensions for this basename
                        // This ensures "ONE HIGH QUALITY IMAGE" rule
                        try {
                            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                            const existingFiles = fs.readdirSync(dir);
                            for (const file of existingFiles) {
                                const fileBase = path.parse(file).name;
                                const fileExt = path.parse(file).ext.toLowerCase();
                                // Match specific basename exactly (avoid accidental prefix matching)
                                if (fileBase === baseName && ['.svg', '.webp', '.png', '.jpg', '.jpeg'].includes(fileExt)) {
                                    if (file !== `${baseName}${ext}`) {
                                        fs.unlinkSync(path.join(dir, file));
                                        console.log(`[ICON_CLEAN] Removed inferior/duplicate format: ${file}`);
                                    }
                                }
                            }

                            fs.writeFileSync(finalPath, buffer);
                            resolve(true);
                        } catch (writeErr) {
                            console.warn(`[ICON_SYNC] Failed to write ${baseName}:`, writeErr);
                            resolve(false);
                        }
                    });
                    return;
                }
                res.resume();
                resolve(false);
            }).on('error', () => resolve(false));
        } catch (e) {
            resolve(false);
        }
    });
}

// ============================================
// ASSET INTEGRITY
// ============================================

export async function verifyAssetIntegrity(): Promise<{ removed: number, scanned: number }> {
    const ICONS_DIR = path.join(process.cwd(), 'public/assets/icons/services');
    let removed = 0;
    let scanned = 0;

    if (!fs.existsSync(ICONS_DIR)) return { removed: 0, scanned: 0 };

    const files = fs.readdirSync(ICONS_DIR);
    console.log(`[ASSETS] Scanning ${files.length} assets for integrity...`);
    const bannedSet = await getBannedHashes();

    // 0. PRE-CLEANUP: Remove Double Extensions (e.g. .webp.webp)
    // These confuse the deduplication logic and are always invalid remnants
    for (const file of files) {
        if (file.toLowerCase().endsWith('.webp.webp') ||
            file.toLowerCase().endsWith('.svg.svg') ||
            file.toLowerCase().endsWith('.png.png') ||
            file.toLowerCase().endsWith('.jpg.jpg')) {
            try {
                fs.unlinkSync(path.join(ICONS_DIR, file));
                removed++;
                console.log(`[ASSET_CLEAN] Removed double extension artifact: ${file}`);
            } catch (e) { }
        }
    }

    // Dedup Logic: Group by basename
    const groups = new Map<string, string[]>();
    // Refresh files list after pre-cleanup
    const cleanFiles = fs.readdirSync(ICONS_DIR);

    for (const file of cleanFiles) {
        const base = path.parse(file).name;
        if (!groups.has(base)) groups.set(base, []);
        groups.get(base)!.push(file);
    }

    for (const [base, variants] of groups.entries()) {
        scanned += variants.length;

        // If multiple formats exist for same service, keep BEST quality
        // Order: SVG > WEBP > PNG > JPG
        if (variants.length > 1) {
            variants.sort((a, b) => {
                const extA = path.extname(a).toLowerCase();
                const extB = path.extname(b).toLowerCase();
                const score = (e: string) => {
                    if (e === '.svg') return 4;
                    if (e === '.webp') return 3;
                    if (e === '.png') return 2;
                    return 1;
                };
                return score(extB) - score(extA); // Descending score
            });

            // Keep index 0, delete others
            const [keep, ...trash] = variants;
            for (const file of trash) {
                console.log(`[ASSET_DEDUP] Removing duplicate lower quality: ${file} (Keeping ${keep})`);
                fs.unlinkSync(path.join(ICONS_DIR, file));
                removed++;
            }
        }
    }

    // Checking individual file integrity
    const remainingFiles = fs.readdirSync(ICONS_DIR); // Re-read
    for (const file of remainingFiles) {
        const filePath = path.join(ICONS_DIR, file);
        try {
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
                fs.unlinkSync(filePath);
                removed++;
                continue;
            }

            // Hash check...
            const buffer = fs.readFileSync(filePath);
            // HTML masquerading as Image check
            const head = buffer.slice(0, 10).toString('utf-8').trim();
            if (head.startsWith('<html') || head.startsWith('<!DOCT')) {
                fs.unlinkSync(filePath);
                removed++;
                continue;
            }

            const hash = crypto.createHash('sha256').update(buffer).digest('hex');
            if (bannedSet.has(hash)) {
                fs.unlinkSync(filePath);
                removed++;
            }

        } catch (e) { }
    }

    return { removed, scanned };
}

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

export interface SyncOptions {
    filterCountryCode?: string // e.g. "95" or "in"
    skipWipe?: boolean        // If true, don't wipe individual provider data (handled globally)
}



// ============================================
// HELPERS
// ============================================

const limit = pLimit(10) // Limit DB upserts concurrency

// ============================================
// FETCHERS




// ============================================
// DYNAMIC SYNC (UNIFIED)
// ============================================

async function syncDynamic(provider: Provider, options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now()
    let countriesCount = 0, servicesCount = 0, pricesCount = 0, error: string | undefined
    const serviceMap = new Map<string, string>()          // code -> name
    const iconUrlMap = new Map<string, string>()      // code -> iconUrl

    try {
        // Pre-load ALL service names from ServiceLookup table for fallback
        const allServiceLookups = await (prisma.serviceLookup as any).findMany({
            select: { serviceCode: true, name: true }
        })
        allServiceLookups.forEach(s => {
            serviceMap.set(s.serviceCode, s.name)
            serviceMap.set(s.serviceCode.toLowerCase(), s.name)
        })
        console.log(`[SYNC] Pre-loaded ${allServiceLookups.length} service names from lookup table`)

        // Update status to syncing
        await prisma.provider.update({
            where: { id: provider.id },
            data: { syncStatus: 'syncing' }
        })

        const bannedHashes = await getBannedHashes()

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

        // 1. Countries (Dynamic)
        // 1. Countries (Dynamic)


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
        // Visibility maps: externalId -> isActive (for filtering hidden items from MeiliSearch)
        const countryVisibilityMap = new Map<string, boolean>()
        const serviceVisibilityMap = new Map<string, boolean>()

        if (skipMetadataSync) {
            console.log(`[SYNC] ${provider.name}: Using DB metadata (${hoursSinceMetadata.toFixed(1)}h old, ${existingCountryCount} countries)`)
            const dbCountries = await prisma.providerCountry.findMany({
                where: { providerId: provider.id },
                select: { id: true, externalId: true, name: true, flagUrl: true, isActive: true }
            })

            // VALIDATION: Check for stale data (countries with 'Unknown' names or missing phoneCode)
            const hasStaleData = dbCountries.some(c => !c.name || c.name === 'Unknown' || c.name === c.externalId)
            if (hasStaleData) {
                console.log(`[SYNC] ${provider.name}: Stale data detected (Unknown/missing names). Forcing fresh fetch...`)
                skipMetadataSync = false
                await prisma.providerCountry.deleteMany({ where: { providerId: provider.id } })
                await prisma.providerService.deleteMany({ where: { providerId: provider.id } })
            } else {
                dbCountries.forEach(c => {
                    countryIdMap.set(c.externalId, c.id)
                    countryVisibilityMap.set(c.externalId, c.isActive)
                    countries.push({ code: c.externalId, name: c.name, flagUrl: c.flagUrl })
                })
                countriesCount = dbCountries.length

                const dbServices = await prisma.providerService.findMany({
                    where: { providerId: provider.id },
                    select: { id: true, externalId: true, name: true, iconUrl: true, isActive: true }
                })
                dbServices.forEach(s => {
                    serviceIdMap.set(s.externalId, s.id)
                    serviceVisibilityMap.set(s.externalId, s.isActive)
                    serviceMap.set(s.externalId, s.name)
                    serviceMap.set(s.externalId.toLowerCase(), s.name)
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

            countries = await engine.getCountries()
            countriesCount = countries.length

            const existingCountryData = await prisma.providerCountry.findMany({
                where: { providerId: provider.id },
                select: { externalId: true, id: true, name: true, code: true, flagUrl: true }
            })
            const countryDiffMap = new Map(existingCountryData.map(c => [c.externalId, c]))

            const countriesToUpsert: typeof countries = []

            for (const c of countries) {
                const externalId = String(c.code)
                const canonicalName = getCanonicalName(c.name || 'Unknown')
                const canonicalCode = getCountryIsoCode(c.code) || generateCanonicalCode(canonicalName)
                const metaFlagUrl = getCountryFlagUrlSync(c.code)
                const validFlagUrl = c.flagUrl || metaFlagUrl || null

                const existing = countryDiffMap.get(externalId)
                if (existing) {
                    // Check for changes
                    if (existing.name !== canonicalName || existing.code !== canonicalCode || existing.flagUrl !== validFlagUrl) {
                        countriesToUpsert.push(c)
                    } else {
                        // UNCHANGED: Just map ID
                        countryIdMap.set(externalId, existing.id)
                    }
                } else {
                    // NEW
                    countriesToUpsert.push(c)
                }
            }

            if (countriesToUpsert.length > 0) {
                console.log(`[SYNC] ${provider.name}: Smart Sync -> Upserting ${countriesToUpsert.length} changed/new countries (Skipped ${countries.length - countriesToUpsert.length})...`)
                const countryPromises = countriesToUpsert.map(c => limit(async () => {
                    const externalId = String(c.code)
                    const canonicalName = getCanonicalName(c.name || 'Unknown')
                    const canonicalCode = getCountryIsoCode(c.code) || generateCanonicalCode(canonicalName)
                    const metaFlagUrl = getCountryFlagUrlSync(c.code)
                    const validFlagUrl = c.flagUrl || metaFlagUrl || null

                    // RESOLVE CENTRAL REGISTRY ID
                    const central = await CentralRegistry.resolveCountryId(provider.name, externalId, c.name || 'Unknown')

                    const record = await prisma.providerCountry.upsert({
                        where: { providerId_externalId: { providerId: provider.id, externalId } },
                        create: {
                            providerId: provider.id,
                            externalId,
                            code: central.code,
                            name: central.name,
                            flagUrl: validFlagUrl,
                            lastSyncAt: new Date()
                        },
                        update: {
                            name: central.name,
                            code: central.code,
                            flagUrl: validFlagUrl,
                            lastSyncAt: new Date()
                        }
                    })
                    countryIdMap.set(externalId, record.id)
                }))
                await Promise.all(countryPromises)
            } else {
                console.log(`[SYNC] ${provider.name}: Smart Sync -> No country metadata changes detected.`)
            }

            // Fetch services
            try {
                services = await engine.getServices('')
            } catch (e) {
                try {
                    services = await engine.getServices('us')
                } catch (e2) {
                    if (countries.length > 0) services = await engine.getServices(countries[0].code)
                }
            }
            servicesCount = services.length

            // SMART SYNC: Detect changes (Services) - Critical Optimization (5000+ items)
            const existingServiceData = await prisma.providerService.findMany({
                where: { providerId: provider.id },
                select: { externalId: true, id: true, name: true, code: true, iconUrl: true }
            })
            const serviceDiffMap = new Map(existingServiceData.map(s => [s.externalId, s]))

            const servicesToUpsert: typeof services = []

            for (const s of services) {
                const serviceCode = String(s.code)
                if (!serviceCode) continue

                // Pre-calculate canonical values for comparison
                let canonicalName = getCanonicalName(s.name || 'Unknown')
                if (serviceCode && CANONICAL_SERVICE_NAMES[serviceCode.toLowerCase()]) {
                    const key = CANONICAL_SERVICE_NAMES[serviceCode.toLowerCase()]
                    if (canonicalName && CANONICAL_DISPLAY_NAMES[key]) {
                        canonicalName = CANONICAL_DISPLAY_NAMES[key]
                    }
                }
                const canonicalCode = generateCanonicalCode(canonicalName)

                // Maps population (Required for Price Sync regardless of DB write)
                serviceMap.set(serviceCode, canonicalName)
                serviceMap.set(serviceCode.toLowerCase(), canonicalName)

                const validIconUrl = isValidImageUrl(s.iconUrl) ? s.iconUrl : null
                if (validIconUrl) {
                    iconUrlMap.set(serviceCode, validIconUrl)
                    iconUrlMap.set(serviceCode.toLowerCase(), validIconUrl)
                }

                // Canonical Key Check for local path
                // Canonical Key Check for local path
                const canonKey = getCanonicalKey(serviceCode) || getCanonicalKey(s.name || '') || generateCanonicalCode(canonicalName)

                // INTELLIGENT PATH RESOLUTION: Check for any supported extension
                let finalExt = '.webp';
                let foundLocal = false;
                const iconsDir = path.join(process.cwd(), 'public/assets/icons/services');

                if (fs.existsSync(iconsDir)) {
                    for (const ext of ['.svg', '.webp', '.png', '.jpg', '.jpeg']) {
                        if (fs.existsSync(path.join(iconsDir, `${canonKey}${ext}`))) {
                            finalExt = ext;
                            foundLocal = true;
                            break;
                        }
                    }
                }

                const localPath = `/assets/icons/services/${canonKey}${finalExt}`
                const fullPath = path.join(process.cwd(), 'public', localPath)

                // AGGRESSIVE DOWNLOAD: If missing locally but we have a URL, fetch it now!
                if (!foundLocal && validIconUrl) {
                    // Fire and forget download to restore missing icons
                    downloadImageToLocal(validIconUrl, fullPath, bannedHashes).catch(err =>
                        console.warn(`[ICON_SYNC] Failed to download ${canonKey}:`, err)
                    )
                }

                const finalIconUrl = foundLocal ? localPath : (validIconUrl || null)

                const existing = serviceDiffMap.get(serviceCode)

                if (existing) {
                    // Check Changes
                    if (existing.name !== canonicalName || existing.code !== canonicalCode || existing.iconUrl !== finalIconUrl) {
                        servicesToUpsert.push(s)
                    } else {
                        // Unchanged
                        serviceIdMap.set(serviceCode, existing.id)
                    }
                } else {
                    // New
                    servicesToUpsert.push(s)
                }
            }

            if (servicesToUpsert.length > 0) {
                console.log(`[SYNC] ${provider.name}: Smart Sync -> Upserting ${servicesToUpsert.length} changed/new services (Skipped ${services.length - servicesToUpsert.length})...`)
                const servicePromises = servicesToUpsert.map(s => limit(async () => {
                    const serviceCode = String(s.code)
                    if (!serviceCode) return

                    let canonicalName = getCanonicalName(s.name || 'Unknown')
                    if (serviceCode && CANONICAL_SERVICE_NAMES[serviceCode.toLowerCase()]) {
                        const key = CANONICAL_SERVICE_NAMES[serviceCode.toLowerCase()]
                        if (CANONICAL_DISPLAY_NAMES[key]) {
                            canonicalName = CANONICAL_DISPLAY_NAMES[key]
                        }
                    }
                    const canonicalCode = generateCanonicalCode(canonicalName)

                    const finalIconUrl = s.iconUrl // Store original in DB for ref

                    // RESOLVE CENTRAL REGISTRY ID
                    const central = await CentralRegistry.resolveServiceId(provider.name, serviceCode, s.name || 'Unknown')

                    const record = await prisma.providerService.upsert({
                        where: { providerId_externalId: { providerId: provider.id, externalId: serviceCode } },
                        create: {
                            providerId: provider.id,
                            externalId: serviceCode,
                            code: central.code,
                            name: central.name,
                            iconUrl: finalIconUrl,
                            isActive: true, // Default to active
                            lastSyncAt: new Date()
                        },
                        update: {
                            name: central.name,
                            code: central.code,
                            iconUrl: finalIconUrl,
                            lastSyncAt: new Date()
                        }
                    })
                    serviceIdMap.set(serviceCode, record.id)
                }))
                await Promise.all(servicePromises)
            } else {
                console.log(`[SYNC] ${provider.name}: Smart Sync -> No service metadata changes detected.`)
            }

            // Update metadata sync timestamp
            await prisma.provider.update({
                where: { id: provider.id },
                data: { lastMetadataSyncAt: new Date() }
            })
        }

        // UNIVERSAL FILTER: Apply country filter regardless of source (DB or API)
        if (options?.filterCountryCode) {
            const target = options.filterCountryCode.toLowerCase()
            countries = countries.filter(c => {
                const canonicalName = getCanonicalName(c.name || '').toLowerCase()
                // Check all possible identifiers
                return String(c.id || '').toLowerCase() === target ||
                    String(c.code || '').toLowerCase() === target ||
                    canonicalName === target ||
                    generateCanonicalCode(canonicalName) === target
            })
            console.log(`[SYNC] ${provider.name}: Global Filter Applied -> ${countries.length} matching countries (${target})`)
        }

        // Pre-cache numeric IDs for search indexing
        const allServiceIds = await (prisma.serviceLookup as any).findMany({ select: { serviceCode: true, id: true } })
        const allCountryIds = await (prisma.countryLookup as any).findMany({ select: { countryCode: true, id: true } })

        const serviceCodeToNumeric = new Map<string, number>(allServiceIds.map((s: any) => [s.serviceCode, s.id]))
        const countryCodeToNumeric = new Map<string, number>(allCountryIds.map((c: any) => [c.countryCode, c.id]))

        // 3. Sync Prices (DEEP SEARCH ENGINE) - Always use Dynamic Engine
        console.log(`[SYNC] ${provider.name}: Starting price sync for ${countries.length} countries...`)

        // Clear existing pricing for this provider before re-indexing
        if (!options?.skipWipe) {
            // Note: ProviderPricing SQL table is deprecated/removed in favor of MeiliSearch
            // We only need to clear the search index
            await deleteOffersByProvider(provider.name)
        }

        // PERFORMANCE OPTIMIZATION: Pre-fetch currency rates & settings ONCE
        const systemSettings = await currencyService.getSettings()
        const providerCurrency = (provider.currency || 'USD').toUpperCase()
        const depositCurrency = (provider.depositCurrency || 'USD').toUpperCase()

        await currencyService['ensureRates']()
        const ratesCache = currencyService['ratesCache'] // Access internal cache directly or via helper if made public

        // Helper: Sync conversion (USD anchor)
        const getRateToUSD = (code: string) => {
            if (code === 'USD') return 1.0
            return ratesCache.get(code.toUpperCase()) || 1.0
        }

        // Calculate Provider Effective Rate (Provider Units per 1 USD)
        let effectiveProviderRate = 1.0
        const normMode = String(provider.normalizationMode || 'AUTO')

        if (normMode === 'MANUAL') {
            effectiveProviderRate = Number(provider.normalizationRate || 1.0)
        } else if (normMode === 'SMART_AUTO' && provider.depositSpent && provider.depositReceived && Number(provider.depositSpent) > 0) {
            const spentRate = getRateToUSD(depositCurrency)
            const spentInUSD = Number(provider.depositSpent) / spentRate
            effectiveProviderRate = Number(provider.depositReceived) / (spentInUSD || 1.0)
        } else {
            effectiveProviderRate = getRateToUSD(providerCurrency)
        }

        const pointsRate = Number(systemSettings.pointsRate)

        const allOffers: OfferDocument[] = []
        const pricingBatch: any[] = []

        // --- SHADOW INDEXING (PHASE 24) ---
        const shadowIndexName = `${SHADOW_PREFIX}${provider.name.toLowerCase()}`
        console.log(`[SYNC] ${provider.name}: Initializing shadow index ${shadowIndexName}...`)
        await initSearchIndexes(shadowIndexName)

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

                    const countryOffers: OfferDocument[] = []

                    for (const p of prices) {
                        if (p.count <= 0) continue

                        const isCountryVisible = countryVisibilityMap.get(country.code) !== false
                        const isServiceVisible = serviceVisibilityMap.get(p.service) !== false &&
                            serviceVisibilityMap.get(p.service.toLowerCase()) !== false
                        const isActive = isCountryVisible && isServiceVisible

                        let svcName = serviceMap.get(p.service)
                        if (!svcName) svcName = serviceMap.get(p.service.toLowerCase())
                        if (!svcName) {
                            svcName = serviceMap.get(p.service) || p.service
                            if (/^\d+$/.test(p.service)) {
                                console.warn(`[SYNC] Service code "${p.service}" has no mapped name. Please add to ServiceLookup.`)
                            }
                        }

                        // CURRENCY & MARGIN LOGIC (Optimized Sync)
                        const providerRawCost = Number(p.cost)
                        const baseCostUSD = providerRawCost / (effectiveProviderRate || 1.0)
                        const baseCostPoints = baseCostUSD * pointsRate

                        const multiplier = Number(provider.priceMultiplier || 1.0)
                        const markupUsd = Number(provider.fixedMarkup || 0.0)
                        const markupPoints = markupUsd * pointsRate

                        const sellPrice = (baseCostPoints * multiplier) + markupPoints

                        // OPERATOR MAPPING
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
                                cost: Number(baseCostUSD.toFixed(4)),
                                providerRawCost: Number(providerRawCost.toFixed(6)),
                                sellPrice: Number(sellPrice.toFixed(2)),
                                stock: p.count,
                                lastSyncAt: new Date()
                            })
                        }

                        // Prepare OfferDocument for MeiliSearch
                        const canonicalSvcName = getCanonicalName(svcName)
                        const canonicalCtyName = normalizeCountryName(country.name || 'Unknown')
                        const canonicalSvcCode = generateCanonicalCode(canonicalSvcName)
                        const canonicalCtyCode = generateCanonicalCode(canonicalCtyName)

                        countryOffers.push({
                            id: `${provider.name}_${p.country}_${p.service}_${externalOp}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                            provider: provider.name,
                            providerCountryCode: p.country, // Raw code from provider
                            countryName: canonicalCtyName,
                            countryId: countryCodeToNumeric.get(canonicalCtyCode),
                            countryIcon: getCountryFlagUrlSync(canonicalCtyName) || getCountryFlagUrlSync(country.name || '') || getCountryFlagUrlSync(p.country) || '',
                            providerServiceCode: p.service, // Raw code from provider
                            serviceName: canonicalSvcName,
                            serviceId: serviceCodeToNumeric.get(canonicalSvcCode),
                            serviceIcon: (() => {
                                // 1. Determine local path first
                                const canonKey = getCanonicalKey(p.service) || getCanonicalKey(svcName) || generateCanonicalCode(canonicalSvcName) || p.service.toLowerCase()

                                const iconsDir = path.join(process.cwd(), 'public/assets/icons/services')
                                let finalExt = '.webp'
                                let foundLocal = false

                                if (fs.existsSync(iconsDir)) {
                                    for (const ext of ['.svg', '.webp', '.png', '.jpg', '.jpeg']) {
                                        if (fs.existsSync(path.join(iconsDir, `${canonKey}${ext}`))) {
                                            finalExt = ext
                                            foundLocal = true
                                            break
                                        }
                                    }
                                }

                                const localPath = `/assets/icons/services/${canonKey}${finalExt}`
                                const fullPath = path.join(process.cwd(), 'public', localPath)

                                // Check existence synchronously
                                if (foundLocal) {
                                    return localPath
                                }

                                // 2. If missing but provider has URL, try to download via side-effect (fire-and-forget)
                                const providerIcon = iconUrlMap.get(p.service) || iconUrlMap.get(p.service.toLowerCase())
                                if (providerIcon && isValidImageUrl(providerIcon)) {
                                    downloadImageToLocal(providerIcon, fullPath).catch(() => { })
                                }

                                // 3. Fallback to Dicebear (Professional Placeholder)
                                const nameForIcon = canonKey || p.service
                                return `https://api.dicebear.com/7.x/initials/svg?seed=${nameForIcon}&backgroundColor=000000&chars=2`
                            })(),
                            operator: String(internalOpId),
                            price: Number(sellPrice.toFixed(2)),
                            rawPrice: Number(providerRawCost.toFixed(6)),
                            stock: p.count,
                            lastSyncedAt: Date.now(),
                            isActive: isActive
                        })
                    }

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

        // Index to Shadow index first
        if (allOffers.length > 0) {
            console.log(`[SYNC] ${provider.name}: Indexing ${allOffers.length} offers to shadow index...`)
            await indexOffers(allOffers, shadowIndexName)

            // ATOMIC SWAP: Move shadow data into live index per-provider
            // Professional Note: Since multiple providers share the 'offers' index, 
            // a global swap is risky if we want per-provider updates.
            // However, with MeiliSearch, we can delete documents by filter and then add.
            // BUT a true Atomic Swap replaces the ENTIRE index.

            // REFINED STRATEGY FOR PHASE 24: 
            // We use 'deleteByFilter' + 'addDocuments' for most syncs.
            // We only use 'swapIndexes' if we are doing a FULL RE-SYNC of all data.

            // For per-provider atomic feel, we rely on MeiliSearch's task queue being sequential for the same index.
            // Let's implement documented "delete then add" in a single task sequence.
            await deleteOffersByProvider(provider.name)
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

    if (!error) {
        recordProviderSync()
    }

    return { provider: provider.name, countries: countriesCount, services: servicesCount, prices: pricesCount, error, duration: Date.now() - startTime }
}


// ============================================
// MAIN EXPORTS
// ============================================

export async function syncProviderData(providerName: string, options?: SyncOptions): Promise<SyncResult> {
    const provider = await prisma.provider.findUnique({ where: { name: providerName } })
    if (provider) {
        return await syncDynamic(provider, options)
    } else {
        throw new Error(`Provider ${providerName} not found via DB`)
    }
}

/**
 * Run a provider sync in a separate worker thread
 */
export function startWorkerSync(providerName: string, options?: SyncOptions): Promise<SyncResult> {
    return new Promise((resolve, reject) => {
        const workerPath = path.join(process.cwd(), 'src/lib/providers/sync-worker.ts')

        // Note: In development with tsx, we use -r tsx to run TS worker
        const worker = new Worker(`
            require('dotenv').config();
            require('tsx/register');
            require('${workerPath.replace(/\\/g, '/')}');
        `, {
            eval: true,
            workerData: { providerName, options }
        })

        worker.on('message', (msg) => {
            if (msg.status === 'success') resolve(msg.result)
            else reject(new Error(msg.error))
        })

        worker.on('error', reject)
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`))
        })
    })
}

export async function syncAllProviders(): Promise<SyncResult[]> {
    console.log(`[SYNC] Starting full sync at ${new Date().toISOString()}`)

    // Refresh exchange rates first to ensure accurate margins
    try {
        await currencyService.syncRates()
    } catch (e) {
        console.error(`[SYNC] Failed to sync exchange rates:`, e)
    }

    const results: SyncResult[] = []
    const providers = await prisma.provider.findMany({ where: { isActive: true } })

    // Professional: Process Isolation
    // High-volume providers are synced in parallel workers
    const syncPromises = providers.map(async (provider) => {
        try {
            // For small providers, or if workers are restricted, we could run in-thread
            // But for senior-level resilience, we offload all.
            const result = await startWorkerSync(provider.name)
            results.push(result)
        } catch (e) {
            console.error(`[SYNC] Failed to sync ${provider.name} in worker:`, e)
        }
    })

    await Promise.all(syncPromises)

    // 4. Refresh precomputed aggregates for fast list responses
    console.log(`[SYNC] Refreshing service aggregates...`)
    try {
        await refreshAllServiceAggregates()
    } catch (e) {
        console.error(`[SYNC] Failed to refresh aggregates:`, e)
    }

    // 5. Sync Service Icons (Universal Advanced Manager)
    console.log(`[SYNC] Starting advanced icon synchronization...`)
    try {
        const { ProviderIconManager } = await import('./icon-manager')
        const iconManager = new ProviderIconManager()
        await iconManager.syncAllProviders()
    } catch (e) {
        console.error(`[SYNC] Failed to sync service icons:`, e)
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
