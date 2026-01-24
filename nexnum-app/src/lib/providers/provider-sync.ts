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

import { prisma } from '@/lib/core/db'
import { Provider } from '@prisma/client'
import { DynamicProvider } from './dynamic-provider'
import fs from 'fs'
import path from 'path'
import https from 'https'
import pLimit from 'p-limit'
import { indexOffers, OfferDocument, deleteOffersByProvider } from '@/lib/search/search'
import { logAdminAction } from '@/lib/core/auditLog'
import * as dotenv from 'dotenv'
dotenv.config()
import { RateLimitedQueue } from '@/lib/utils/async-utils'

// Import legacy providers from centralized location
import { getLegacyProvider, hasLegacyProvider } from './provider-factory'
import { refreshAllServiceAggregates } from '@/lib/search/service-aggregates'
import { resolveToCanonicalName, getSlugFromName, getCanonicalKey, CANONICAL_SERVICE_NAMES, CANONICAL_DISPLAY_NAMES } from '@/lib/normalizers/service-identity'
import { getCountryIsoCode, normalizeCountryName } from '@/lib/normalizers/country-normalizer'
import { getCountryFlagUrlSync } from '@/lib/normalizers/country-flags'
import { isValidImageUrl } from '@/lib/utils/utils'
import { currencyService } from '@/lib/currency/currency-service'
import crypto from 'crypto';

// ============================================
// CONSTANTS
// ============================================

// Known bad hashes to block permanently (Shared between download and verify)
// Known bad hashes to block permanently (Shared between download and verify)
const HARDCODED_BANNED = new Set([
    'be311539f1b49d644e5a70c1f0023c05a7eebabd282287305e8ca49587087702' // 5sim Bad Bear
]);

async function getBannedHashes(): Promise<Set<string>> {
    try {
        const dbHashes = await (prisma as any).bannedIcon.findMany({ select: { hash: true } })
        const set = new Set<string>(dbHashes.map((b: any) => b.hash))
        HARDCODED_BANNED.forEach(h => set.add(h))
        return set
    } catch (e) {
        return HARDCODED_BANNED
    }
}

// Helper: Download image to local path with strict single-file enforcement
async function downloadImageToLocal(url: string, destPath: string, bannedSet?: Set<string>): Promise<boolean> {
    const dir = path.dirname(destPath);
    const baseName = path.parse(destPath).name; // e.g., "instagram"

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
                        const isBanned = (bannedSet && bannedSet.has(hash)) || HARDCODED_BANNED.has(hash)

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
    const ICONS_DIR = path.join(process.cwd(), 'public/icons/services');
    let removed = 0;
    let scanned = 0;

    if (!fs.existsSync(ICONS_DIR)) return { removed: 0, scanned: 0 };

    const files = fs.readdirSync(ICONS_DIR);
    console.log(`[ASSETS] Scanning ${files.length} assets for integrity...`);
    const bannedSet = await getBannedHashes();

    // Dedup Logic: Group by basename
    const groups = new Map<string, string[]>();
    for (const file of files) {
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

// Providers that use legacy logic for metadata fetching
const LEGACY_METADATA_PROVIDERS = ['5sim', 'grizzlysms', 'herosms']

// ============================================
// HELPERS
// ============================================

const limit = pLimit(10) // Limit DB upserts concurrency

async function upsertCountryLookup(code: string, name: string, flagUrl?: string | null) {
    try {
        const validFlagUrl = isValidImageUrl(flagUrl) ? flagUrl : null
        await prisma.countryLookup.upsert({
            where: { code },
            create: { code, name, flagUrl: validFlagUrl },
            update: { name, flagUrl: validFlagUrl || undefined }
        })
    } catch (e) { }
}

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
                    await upsertCountryLookup(c.id, c.name, null)
                    results.push({
                        code: c.id,
                        name: c.name,
                        flagUrl: null
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
        flagUrl: null
    }))
}

async function upsertServiceLookup(code: string, name: string, iconUrl?: string | null) {
    try {
        const canonicalName = resolveToCanonicalName(name)
        const canonicalCode = getSlugFromName(canonicalName)

        const validIconUrl = isValidImageUrl(iconUrl) ? iconUrl : null

        // Prioritize local icon path if it exists (Check all formats)
        const iconsDir = path.join(process.cwd(), 'public/icons/services')
        let finalLocalPath: string | null = null

        if (fs.existsSync(iconsDir)) {
            for (const ext of ['.svg', '.webp', '.png', '.jpg', '.jpeg']) {
                if (fs.existsSync(path.join(iconsDir, `${canonicalCode}${ext}`))) {
                    finalLocalPath = `/icons/services/${canonicalCode}${ext}`
                    break
                }
            }
        }

        const finalIconUrl = finalLocalPath || (validIconUrl || undefined)

        await prisma.serviceLookup.upsert({
            where: { code: canonicalCode },
            create: { code: canonicalCode, name: canonicalName, iconUrl: finalIconUrl },
            update: { name: canonicalName, iconUrl: finalIconUrl }
        })
    } catch (e) {
        // Suppress unique constraint race conditions
    }
}

// ============================================
// LEGACY FETCHERS (Using centralized providers)
// ============================================

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
}


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

        // 1. Countries (Hybrid: Legacy or Dynamic)
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

            // Fetch countries
            if (!useDynamicMetadata && LEGACY_METADATA_PROVIDERS.includes(provider.name.toLowerCase())) {
                countries = await getCountriesLegacy(provider, engine)
            } else {
                countries = await engine.getCountries()
            }
            countriesCount = countries.length

            const existingCountryData = await prisma.providerCountry.findMany({
                where: { providerId: provider.id },
                select: { externalId: true, id: true, name: true, code: true, flagUrl: true }
            })
            const countryDiffMap = new Map(existingCountryData.map(c => [c.externalId, c]))

            const countriesToUpsert: typeof countries = []

            for (const c of countries) {
                const externalId = String(c.id || c.code || 'unknown')
                const canonicalName = resolveToCanonicalName(c.name || 'Unknown')
                const canonicalCode = getCountryIsoCode(c.code || c.id) || getSlugFromName(canonicalName)
                const metaFlagUrl = getCountryFlagUrlSync(c.code || c.id)
                const validFlagUrl = c.flagUrl || metaFlagUrl || (isValidImageUrl((c as any).flag) ? (c as any).flag : null)

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
                    const externalId = String(c.id || c.code || 'unknown')
                    const canonicalName = resolveToCanonicalName(c.name || 'Unknown')
                    const canonicalCode = getCountryIsoCode(c.code || c.id) || getSlugFromName(canonicalName)
                    const metaFlagUrl = getCountryFlagUrlSync(c.code || c.id)
                    const validFlagUrl = c.flagUrl || metaFlagUrl || (isValidImageUrl((c as any).flag) ? (c as any).flag : null)

                    const record = await prisma.providerCountry.upsert({
                        where: { providerId_externalId: { providerId: provider.id, externalId } },
                        create: {
                            providerId: provider.id,
                            externalId,
                            code: canonicalCode,
                            name: canonicalName,
                            flagUrl: validFlagUrl,
                            lastSyncAt: new Date()
                        },
                        update: {
                            name: canonicalName,
                            code: canonicalCode,
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
            if (!useDynamicMetadata && LEGACY_METADATA_PROVIDERS.includes(provider.name.toLowerCase())) {
                await getServicesLegacy(provider, engine)
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

            // SMART SYNC: Detect changes (Services) - Critical Optimization (5000+ items)
            const existingServiceData = await prisma.providerService.findMany({
                where: { providerId: provider.id },
                select: { externalId: true, id: true, name: true, code: true, iconUrl: true }
            })
            const serviceDiffMap = new Map(existingServiceData.map(s => [s.externalId, s]))

            const servicesToUpsert: typeof services = []

            for (const s of services) {
                const serviceCode = s.id || s.code
                if (!serviceCode) continue

                // Pre-calculate canonical values for comparison
                let canonicalName = resolveToCanonicalName(s.name || 'Unknown')
                if (serviceCode && CANONICAL_SERVICE_NAMES[serviceCode.toLowerCase()]) {
                    const key = CANONICAL_SERVICE_NAMES[serviceCode.toLowerCase()]
                    if (CANONICAL_DISPLAY_NAMES[key]) {
                        canonicalName = CANONICAL_DISPLAY_NAMES[key]
                    }
                }
                const canonicalCode = getSlugFromName(canonicalName)

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
                const canonKey = getCanonicalKey(serviceCode) || getCanonicalKey(s.name || '') || getSlugFromName(canonicalName)

                // INTELLIGENT PATH RESOLUTION: Check for any supported extension
                let finalExt = '.webp';
                let foundLocal = false;
                const iconsDir = path.join(process.cwd(), 'public/icons/services');

                if (fs.existsSync(iconsDir)) {
                    for (const ext of ['.svg', '.webp', '.png', '.jpg', '.jpeg']) {
                        if (fs.existsSync(path.join(iconsDir, `${canonKey}${ext}`))) {
                            finalExt = ext;
                            foundLocal = true;
                            break;
                        }
                    }
                }

                const localPath = `/icons/services/${canonKey}${finalExt}`
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
                    const serviceCode = s.id || s.code
                    if (!serviceCode) return

                    let canonicalName = resolveToCanonicalName(s.name || 'Unknown')
                    if (serviceCode && CANONICAL_SERVICE_NAMES[serviceCode.toLowerCase()]) {
                        const key = CANONICAL_SERVICE_NAMES[serviceCode.toLowerCase()]
                        if (CANONICAL_DISPLAY_NAMES[key]) {
                            canonicalName = CANONICAL_DISPLAY_NAMES[key]
                        }
                    }
                    const canonicalCode = getSlugFromName(canonicalName)

                    const finalIconUrl = s.iconUrl // Store original in DB for ref

                    const record = await prisma.providerService.upsert({
                        where: { providerId_externalId: { providerId: provider.id, externalId: serviceCode } },
                        create: {
                            providerId: provider.id,
                            externalId: serviceCode,
                            code: canonicalCode,
                            name: canonicalName,
                            iconUrl: finalIconUrl,
                            isActive: true, // Default to active
                            lastSyncAt: new Date()
                        },
                        update: {
                            name: canonicalName,
                            code: canonicalCode,
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
                const canonicalName = resolveToCanonicalName(c.name || '').toLowerCase()
                // Check all possible identifiers
                return String(c.id || '').toLowerCase() === target ||
                    String(c.code || '').toLowerCase() === target ||
                    canonicalName === target ||
                    getSlugFromName(canonicalName) === target
            })
            console.log(`[SYNC] ${provider.name}: Global Filter Applied -> ${countries.length} matching countries (${target})`)
        }

        // 3. Sync Prices (DEEP SEARCH ENGINE) - Always use Dynamic Engine
        console.log(`[SYNC] ${provider.name}: Starting price sync for ${countries.length} countries...`)

        // Clear existing pricing for this provider before re-indexing
        if (!options?.skipWipe) {
            // Use raw SQL to delete reservations referencing this provider's pricing (avoids parameter limit)
            await prisma.$executeRaw`
                DELETE FROM offer_reservations 
                WHERE pricing_id IN (
                    SELECT id FROM provider_pricing WHERE provider_id = ${provider.id}
                )
            `
            await prisma.providerPricing.deleteMany({ where: { providerId: provider.id } })
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
                        const canonicalSvcName = resolveToCanonicalName(svcName)
                        const canonicalCtyName = normalizeCountryName(country.name || 'Unknown')

                        countryOffers.push({
                            id: `${provider.name}_${p.country}_${p.service}_${externalOp}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                            provider: provider.name,
                            countryCode: p.country,
                            countryName: canonicalCtyName,
                            flagUrl: getCountryFlagUrlSync(canonicalCtyName) || getCountryFlagUrlSync(country.name || '') || getCountryFlagUrlSync(p.country) || '',
                            serviceSlug: p.service,
                            serviceName: canonicalSvcName,
                            iconUrl: (() => {
                                // 1. Determine local path first
                                const canonKey = getCanonicalKey(p.service) || getCanonicalKey(svcName) || getSlugFromName(canonicalSvcName) || p.service.toLowerCase()

                                const iconsDir = path.join(process.cwd(), 'public/icons/services')
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

                                const localPath = `/icons/services/${canonKey}${finalExt}`
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
                            operatorId: internalOpId,
                            externalOperator: externalOp !== 'default' ? externalOp : undefined,
                            price: Number(sellPrice.toFixed(2)),
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

export async function syncProviderData(providerName: string, options?: SyncOptions): Promise<SyncResult> {
    const provider = await prisma.provider.findUnique({ where: { name: providerName } })
    if (provider) {
        return await syncDynamic(provider, options)
    } else {
        throw new Error(`Provider ${providerName} not found via DB`)
    }
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
    for (const provider of providers) {
        try {
            const result = await syncProviderData(provider.name)
            results.push(result)
        } catch (e) {
            console.error(`[SYNC] Failed to sync ${provider.name}:`, e)
        }
    }

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
