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

import { prisma, getSafeConcurrency } from '@/lib/core/db'
import { Provider } from '@prisma/client'
import { DynamicProvider } from './dynamic-provider'
import { PriceData, Country, Service } from './types'
import fs from 'fs'
import path from 'path'
import https from 'https'
import pLimit from 'p-limit'
import { indexOffers, OfferDocument, deleteOffersByProvider, INDEXES, swapShadowToPrimary, initSearchIndexes, waitForTasks } from '@/lib/search/search'
import { logAdminAction } from '@/lib/core/auditLog'
import * as dotenv from 'dotenv'
// Senior-Level Optimization: worker_threads is only loaded dynamically to prevent Turbopack build panics
dotenv.config()
import { RateLimitedQueue } from '@/lib/utils/async-utils'
import { recordProviderSync } from '@/lib/metrics'

import { refreshAllServiceAggregates } from '@/lib/search/service-aggregates'
import { getCanonicalName, generateCanonicalCode, getCanonicalKey, CANONICAL_SERVICE_NAMES, CANONICAL_DISPLAY_NAMES } from '@/lib/normalizers/service-identity'
import { getCountryIsoCode, normalizeCountryName } from '@/lib/normalizers/country-normalizer'
import { getCountryFlagUrlSync } from '@/lib/normalizers/country-flags'
import { isValidImageUrl } from '@/lib/utils/utils'
import { getCurrencyService } from '@/lib/currency/currency-service'
import { PricingService } from '@/lib/pricing/pricing-service'
import { PricingConfig } from '@/config/app.config'
import crypto from 'crypto';
import { CentralRegistry } from '@/lib/normalizers/central-registry';
import { logger } from '@/lib/core/logger';
import { getTraceId } from '@/lib/api/request-context';
import { recordHeartbeat } from '@/lib/workers/heartbeat-registry';

// ============================================
// CONSTANTS
// ============================================

// Banned hashes are now fully managed via DB (seed-banned-icons.ts)
// Cached in module scope for the duration of a master sync to avoid repeated DB queries
let _bannedHashesCache: Set<string> | null = null

async function getBannedHashes(): Promise<Set<string>> {
    if (_bannedHashesCache) return _bannedHashesCache
    try {
        const dbHashes = await prisma.bannedIcon.findMany({ select: { hash: true } })
        _bannedHashesCache = new Set<string>(dbHashes.map((b) => b.hash))
        return _bannedHashesCache
    } catch (e) {
        console.error('[SYNC] Failed to fetch banned hashes:', e)
        return new Set<string>()
    }
}

/** Clear the banned hashes cache. Call after master sync completes. */
export function clearBannedHashesCache(): void {
    _bannedHashesCache = null
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
                            logger.warn('Provider icon hash match (Banned). Ignoring.', {
                                context: 'ICON_BANNED',
                                baseName,
                                hash
                            });
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
                                        try { fs.unlinkSync(path.join(dir, file)) } catch { }
                                        logger.info('Removed inferior/duplicate format', {
                                            context: 'ICON_CLEAN',
                                            file
                                        });
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
    logger.info('Scanning assets for integrity', {
        context: 'ASSETS',
        count: files.length
    });
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
                logger.debug('Removed double extension artifact', {
                    context: 'ASSET_CLEAN',
                    file
                });
            } catch (e) {
                logger.warn('[ProviderSync] Asset clean unlink failed', { file, error: e })
            }
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
                logger.debug('Removing duplicate lower quality asset', {
                    context: 'ASSET_DEDUP',
                    file,
                    keeping: keep
                });
                try { fs.unlinkSync(path.join(ICONS_DIR, file)) } catch { }
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
                try { fs.unlinkSync(filePath) } catch { }
                removed++;
                continue;
            }

            // Hash check...
            const buffer = fs.readFileSync(filePath);
            // HTML masquerading as Image check
            const head = buffer.slice(0, 10).toString('utf-8').trim();
            if (head.startsWith('<html') || head.startsWith('<!DOCT')) {
                try { fs.unlinkSync(filePath) } catch { }
                removed++;
                continue;
            }

            const hash = crypto.createHash('sha256').update(buffer).digest('hex');
            if (bannedSet.has(hash)) {
                try { fs.unlinkSync(filePath) } catch { }
                removed++;
            }

        } catch (e) {
            logger.warn('[ProviderSync] File integrity check failed', { file: filePath, error: e })
        }
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

// Senior-level pool-aware concurrency: match pg.Pool max so we never
// queue more queries than the pool has sockets free.
const limit = pLimit(getSafeConcurrency()) // Limit DB upserts concurrency (Optimized)

// ============================================
// FETCHERS




// ============================================
// DYNAMIC SYNC (UNIFIED)
// ============================================

/** Extract rate limit config from provider's endpoints JSON, with defaults */
function getProviderRateLimits(provider: Provider): { concurrency: number; interval: number } {
    const defaults = { concurrency: 50, interval: 180 }
    try {
        const endpoints = provider.endpoints as any
        if (endpoints?.rateLimit) {
            return {
                concurrency: Math.max(1, Math.min(200, Number(endpoints.rateLimit.concurrency) || defaults.concurrency)),
                interval: Math.max(50, Math.min(5000, Number(endpoints.rateLimit.interval) || defaults.interval))
            }
        }
    } catch { /* fall through to defaults */ }
    return defaults
}

async function syncDynamic(provider: Provider, options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now()
    let countriesCount = 0, servicesCount = 0, pricesCount = 0, error: string | undefined
    const serviceMap = new Map<string, string>()          // code -> name
    const countryNameMap = new Map<string, string>()      // code -> name
    const iconUrlMap = new Map<string, string>()      // code -> iconUrl

    try {
        // Pre-load ALL service names AND IDs from ServiceLookup table for fallback
        // OPTIMIZATION: Include serviceId and build lookup map for batch resolution
        const allServiceLookups = await prisma.serviceLookup.findMany({
            select: { serviceCode: true, serviceName: true, serviceId: true }
        })
        const serviceIdLookup = new Map<string, number>()

        allServiceLookups.forEach(s => {
            serviceMap.set(s.serviceCode, s.serviceName)
            serviceMap.set(s.serviceCode.toLowerCase(), s.serviceName)
            serviceIdLookup.set(s.serviceCode, s.serviceId)
        })
        logger.info('Pre-loaded service names from lookup table', {
            context: 'SYNC',
            count: allServiceLookups.length
        })

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
            logger.warn('Failed to fetch provider balance', {
                context: 'SYNC',
                provider: provider.name,
                error: (be as any).message
            })
        }

        // Filter counters — surfaced in the final summary log.
        // Declared here (outer scope) so both the sync loops (countries, services)
        // AND the price-indexing loop can increment them.
        let filteredZeroCount = 0
        let filteredBelowMinCount = 0
        let filteredAboveMaxCount = 0
        let noServiceNameCount = 0
        let noCountryNameCount = 0
        let erroredRows = 0

        // 1. Countries (Dynamic)
        // 1. Countries (Dynamic)


        // Initialize arrays
        let countries: Country[] = []
        let services: Service[] = []

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
            logger.info('Using existing DB metadata for sync', {
                context: 'SYNC',
                provider: provider.name,
                ageHours: hoursSinceMetadata.toFixed(1),
                count: existingCountryCount
            })
            const dbCountries = await prisma.providerCountry.findMany({
                where: { providerId: provider.id },
                select: { id: true, externalId: true, name: true, flagUrl: true, isActive: true }
            })

            // VALIDATION: Check for stale data (countries with 'Unknown' names or missing phoneCode)
            const hasStaleData = dbCountries.some(c => !c.name || c.name === 'Unknown' || c.name === c.externalId)
            if (hasStaleData) {
                logger.info('Stale provider metadata detected, forcing fresh fetch', {
                    context: 'SYNC',
                    provider: provider.name
                })
                skipMetadataSync = false
                await prisma.providerCountry.deleteMany({ where: { providerId: provider.id } })
                await prisma.providerService.deleteMany({ where: { providerId: provider.id } })
            } else {
                dbCountries.forEach(c => {
                    countryIdMap.set(c.externalId, c.id)
                    countryVisibilityMap.set(c.externalId, c.isActive)
                    countryNameMap.set(c.externalId, c.name)
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
            logger.info('Fetching fresh provider metadata', {
                context: 'SYNC',
                provider: provider.name
            })

            countries = await engine.getCountriesList()
            countriesCount = countries.length

            const existingCountryData = await prisma.providerCountry.findMany({
                where: { providerId: provider.id },
                select: { externalId: true, id: true, name: true, code: true, flagUrl: true }
            })
            const countryDiffMap = new Map(existingCountryData.map(c => [c.externalId, c]))

            const countriesToUpsert: typeof countries = []

            for (const c of countries) {
                const externalId = String(c.code)
                // GUARD: skip countries with no proper name. Using 'Unknown' or
                // the raw code as a display name pollutes the user-facing UI and
                // breaks the canonical-aggregate table. Real providers always
                // return a country name; missing one is a data-quality bug worth
                // surfacing in logs rather than silently indexing garbage.
                const rawName = (c.name || '').trim()
                if (!rawName || rawName.toLowerCase() === 'unknown') {
                    noCountryNameCount++
                    logger.warn(`[SYNC] Skipping country with no/garbage name`, {
                        context: 'SYNC',
                        provider: provider.name,
                        code: externalId,
                        rawName: c.name
                    })
                    continue
                }
                const canonicalName = getCanonicalName(rawName)
                countryNameMap.set(externalId, canonicalName)

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
                logger.debug('Smart Sync: Upserting country metadata', {
                    context: 'SYNC',
                    provider: provider.name,
                    upsertCount: countriesToUpsert.length,
                    skippedCount: countries.length - countriesToUpsert.length
                })
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
                logger.info('Smart Sync: No country metadata changes detected', {
                    context: 'SYNC',
                    provider: provider.name
                })
            }

            // Fetch services
            try {
                services = await engine.getServicesList('')
            } catch (e) {
                try {
                    services = await engine.getServicesList('us')
                } catch (e2) {
                    if (countries.length > 0) services = await engine.getServicesList(countries[0].code)
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

                // GUARD: skip services with no proper name. Falling back to the
                // service code as a display name (e.g. "tg", "wa", "ig") creates
                // garbage in the UI and fragments search results. Only index
                // services where we can resolve a human-readable name — either
                // from the provider's payload OR the canonical code override.
                const rawSvcName = (s.name || '').trim()
                if (!rawSvcName || rawSvcName.toLowerCase() === 'unknown') {
                    noServiceNameCount++
                    logger.warn(`[SYNC] Skipping service with no/garbage name`, {
                        context: 'SYNC',
                        provider: provider.name,
                        code: serviceCode,
                        rawName: s.name
                    })
                    continue
                }

                // Pre-calculate canonical values for comparison
                let canonicalName = getCanonicalName(rawSvcName)
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
                        logger.warn('Failed to download missing provider icon', {
                            context: 'ICON_SYNC',
                            canonKey,
                            error: (err as any).message
                        })
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
                logger.debug('Smart Sync: Upserting service metadata', {
                    context: 'SYNC',
                    provider: provider.name,
                    upsertCount: servicesToUpsert.length,
                    skippedCount: services.length - servicesToUpsert.length
                })

                // OPTIMIZATION: Batch-register new services in Central Lookup
                const pendingRegistration = new Map<string, string>() // code -> name

                // 1. Identify all needed canonical codes
                for (const s of servicesToUpsert) {
                    const idx = String(s.code || '').toLowerCase()
                    if (!idx) continue

                    let cName = getCanonicalName(s.name || 'Unknown')
                    if (CANONICAL_SERVICE_NAMES[idx]) {
                        const key = CANONICAL_SERVICE_NAMES[idx]
                        if (CANONICAL_DISPLAY_NAMES[key]) cName = CANONICAL_DISPLAY_NAMES[key]
                    }
                    const cCode = generateCanonicalCode(cName)

                    if (!serviceIdLookup.has(cCode)) {
                        pendingRegistration.set(cCode, cName)
                    }
                }

                // 2. Create missing lookups in parallel (Batched)
                if (pendingRegistration.size > 0) {
                    logger.info(`[SYNC] Batch registering ${pendingRegistration.size} new services to Central Registry...`)
                    const newServices = Array.from(pendingRegistration.entries())

                    // Concurrency limit for registration.
                    // MUST stay ≤ pg.Pool max (or 1–2 lower) — otherwise queries queue
                    // behind each other and time out at connectionTimeoutMillis.
                    const regLimit = pLimit(getSafeConcurrency())

                    await Promise.all(newServices.map(([code, name]) => regLimit(async () => {
                        try {
                            const lookup = await prisma.serviceLookup.upsert({
                                where: { serviceCode: code },
                                update: {},
                                create: { serviceCode: code, serviceName: name }
                            })
                            serviceIdLookup.set(code, lookup.serviceId)
                            // Also update the map for name resolution
                            serviceMap.set(code, name)
                        } catch (e) {
                            // Ignore race conditions
                        }
                    })))
                }

                // 3. Upsert Provider Services (Now purely local logic + DB write)
                // Optimized: Process metadata in larger batches to reduce sync duration.
                // Concurrency capped to pool size so we don't queue behind ourselves
                // and trip the 3s connectionTimeoutMillis on Supabase free tier.
                const serviceUpsertLimit = pLimit(getSafeConcurrency())
                const servicePromises = servicesToUpsert.map(s => serviceUpsertLimit(async () => {
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

                    // NOTE: We rely on serviceIdLookup ensuring the Central Registry is populated.
                    // ProviderService doesn't store the ID currently, but we use the canonical code/name.

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

                // Log progress for large batches
                const total = servicePromises.length
                if (total > 500) {
                    logger.info(`[SYNC] Processing ${total} service upserts in parallel...`)
                }

                await Promise.all(servicePromises)
            } else {
                logger.info('Smart Sync: No service metadata changes detected', {
                    context: 'SYNC',
                    provider: provider.name
                })
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
            logger.info('Global filter applied to provider sync', {
                context: 'SYNC',
                provider: provider.name,
                target,
                matchCount: countries.length
            })
        }

        // Pre-cache numeric IDs for search indexing
        const allServiceIds = await prisma.serviceLookup.findMany({ select: { serviceCode: true, serviceId: true } })
        const allCountryIds = await prisma.countryLookup.findMany({ select: { countryCode: true, countryId: true } })

        const serviceCodeToNumeric = new Map<string, number>(allServiceIds.map((s) => [s.serviceCode, s.serviceId]))
        const countryCodeToNumeric = new Map<string, number>(allCountryIds.map((c) => [c.countryCode, c.countryId]))

        // 3. Sync Prices (DEEP SEARCH ENGINE) - Always use Dynamic Engine
        logger.info('Starting provider price sync', {
            context: 'SYNC',
            provider: provider.name,
            countryCount: countries.length
        })

        const meiliTaskIds: number[] = []

        // DEFERRED WIPE: We now wipe only if we successfully fetch new data to avoid clearing the index on transient API failures.


        // PERFORMANCE OPTIMIZATION: Pre-fetch currency rates & settings ONCE
        const currencyService = getCurrencyService()
        const systemSettings = await currencyService.getSettings()
        const providerCurrency = (provider.currency || 'USD').toUpperCase()
        const depositCurrency = (provider.depositCurrency || 'USD').toUpperCase()

        const rates = await currencyService.getAllRates()
        const ratesCache = new Map(Object.entries(rates))

        // MULTI-CURRENCY: Fetch all active currencies for pre-computation
        const activeCurrencies = await prisma.currency.findMany({
            where: { isActive: true },
            select: { code: true, rate: true }
        })
        const currencyRatesMap = new Map(activeCurrencies.map(c => [c.code, Number(c.rate)]))

        // PricingService input — built once per provider sync, used by every offer.
        // The rate is resolved lazily inside PricingService for each offer so a
        // missing deposit (SMART_AUTO → fallback to AUTO) doesn't poison the
        // whole provider.
        const providerCfg = {
            currency: providerCurrency,
            normalizationMode: String(provider.normalizationMode || 'AUTO'),
            normalizationRate: provider.normalizationRate,
            depositSpent: provider.depositSpent,
            depositReceived: provider.depositReceived,
            depositCurrency,
            priceMultiplier: Number(provider.priceMultiplier) || 1.0,
            fixedMarkup: Number(provider.fixedMarkup) || 0.0,
        }
        const pointsRate = Number(systemSettings.pointsRate)
        const standardRates = Object.fromEntries(ratesCache) as Record<string, number>

        // Filter thresholds
        const minPriceUsd = PricingConfig.minPrice
        const maxPriceUsd = PricingConfig.maxPrice


        // Collect offers in a Map to automatically deduplicate by ID
        // This prevents MDB_KEYEXIST errors in MeiliSearch if a provider returns redundant data
        const allOffersMap = new Map<string, OfferDocument>()

        // Operator mapping: Track provider+externalOperator -> internal sequential ID
        const operatorMap = new Map<string, number>()
        let operatorCounter = 1

        // Filter counters — declared in the outer scope so the countries
        // sync, services sync, and price-indexing loop all share them.

        const processPrices = async (prices: PriceData[], country?: { code: string; name: string }) => {
            const currentCountryOffers: OfferDocument[] = []
            const currentCountryCode = country?.code || ''

            for (const p of prices) {
                try {
                    if (p.count <= 0) continue

                    // Zero-cost filter: drop offers where the provider returned
                    // cost = 0 (some providers do this for "free" SMS). Without
                    // this filter the offer would index as pointPrice = 0.
                    if (!Number.isFinite(p.cost) || p.cost <= 0) {
                        filteredZeroCount++
                        continue
                    }

                    // Visibility Checks
                    const countryCode = p.country || currentCountryCode
                    const isCountryVisible = countryVisibilityMap.get(countryCode) !== false
                    const isServiceVisible = serviceVisibilityMap.get(p.service) !== false &&
                        serviceVisibilityMap.get(p.service.toLowerCase()) !== false
                    const isActive = isCountryVisible && isServiceVisible

                    let svcName = serviceMap.get(p.service)
                    if (!svcName) svcName = serviceMap.get(p.service.toLowerCase())
                    // GUARD: if the service name wasn't resolved to a human-readable
                    // string, OR the only thing we have is the raw service code
                    // (the `|| p.service` fallback that previously polluted the
                    // catalog with "tg", "wa", "ig" as display names), skip this
                    // offer. Real providers always return a service name; missing
                    // one is a data-quality bug worth surfacing in logs.
                    if (!svcName || svcName === p.service) {
                        noServiceNameCount++
                        logger.warn(`[SYNC] Skipping price: no resolvable service name`, {
                            context: 'SYNC',
                            provider: provider.name,
                            country: countryCode,
                            service: p.service,
                            svcName
                        })
                        continue
                    }

                    // CURRENCY & MARGIN LOGIC — single PricingService call.
                    // Returns null if rawCost is invalid (zero, negative, NaN).
                    const pricing = PricingService.compute({
                        rawCost: Number(p.cost),
                        providerCurrency,
                        provider: providerCfg,
                        standardRates,
                        pointsRate,
                        isPointsMode: true,
                    })
                    if (!pricing) {
                        filteredZeroCount++
                        continue
                    }

                    // Cap to configured USD bounds so a misconfigured multiplier
                    // can't produce a $0.001 or $9999 offer.
                    if (pricing.costUsd < minPriceUsd) {
                        filteredBelowMinCount++
                        continue
                    }
                    if (pricing.sellUsd > maxPriceUsd) {
                        filteredAboveMaxCount++
                        continue
                    }

                    const sellPrice = pricing.pointPrice

                    // MULTI-CURRENCY: Pre-compute prices for all active currencies using unified map generator
                    const currencyPrices = await currencyService.pointsToAllFiat(sellPrice)

                    // OPERATOR MAPPING
                    const externalOp = p.operator != null ? String(p.operator) : 'default'
                    const opKey = `${provider.name}_${externalOp}`
                    if (!operatorMap.has(opKey)) {
                        operatorMap.set(opKey, operatorCounter++)
                    }
                    const internalOpId = operatorMap.get(opKey)!

                    // Prepare OfferDocument for MeiliSearch
                    const canonicalSvcName = getCanonicalName(svcName)

                    // Resolve Country Name from Map (Crucial for numeric provider IDs).
                    // GUARD: if no human-readable country name resolves, skip the
                    // offer. Falling back to the country code (e.g. "us") or
                    // "Unknown" as a display name pollutes the catalog. Real
                    // providers always return a country name; missing one is a
                    // data-quality bug worth surfacing in logs.
                    const resolvedCountryName = (countryNameMap.get(countryCode) || p.country || country?.name || '').trim()
                    if (!resolvedCountryName || resolvedCountryName.toLowerCase() === 'unknown') {
                        noCountryNameCount++
                        logger.warn(`[SYNC] Skipping price: no resolvable country name`, {
                            context: 'SYNC',
                            provider: provider.name,
                            country: countryCode,
                            service: p.service,
                            resolvedCountryName
                        })
                        continue
                    }
                    const canonicalCtyName = normalizeCountryName(resolvedCountryName)
                    const canonicalSvcCode = generateCanonicalCode(canonicalSvcName)
                    const canonicalCtyCode = generateCanonicalCode(canonicalCtyName)

                    const offerId = `${provider.name}_${countryCode}_${p.service}_${externalOp}`.toLowerCase().replace(/[^a-z0-9_]/g, '')

                    allOffersMap.set(offerId, {
                        id: offerId,
                        provider: provider.name,
                        providerCountryCode: countryCode,
                        countryName: canonicalCtyName,
                        countryId: countryCodeToNumeric.get(canonicalCtyCode),
                        countryIcon: getCountryFlagUrlSync(canonicalCtyName) || getCountryFlagUrlSync(p.country || country?.name || '') || '',
                        providerServiceCode: p.service,
                        serviceName: canonicalSvcName,
                        serviceId: serviceCodeToNumeric.get(canonicalSvcCode),
                        serviceIcon: (() => {
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
                            if (foundLocal) return localPath

                            const providerIcon = iconUrlMap.get(p.service) || iconUrlMap.get(p.service.toLowerCase())
                            if (providerIcon && isValidImageUrl(providerIcon)) {
                                downloadImageToLocal(providerIcon, path.join(process.cwd(), 'public', localPath)).catch(err => logger.warn('[ProviderSync] downloadImageToLocal failed', { url: providerIcon, error: err }))
                            }

                            const nameForIcon = canonKey || p.service
                            return `https://api.dicebear.com/7.x/initials/svg?seed=${nameForIcon}&backgroundColor=000000&chars=2`
                        })(),
                        operator: String(internalOpId),
                        pointPrice: Number(sellPrice),
                        rawPrice: Number(pricing.rawCost.toFixed(6)),
                        currencyPrices,
                        stock: p.count,
                        lastSyncedAt: Date.now(),
                        isActive: isActive
                    })

                    pricesCount++
                } catch (rowErr: any) {
                    // One bad row must not fail the whole batch. Log and continue.
                    erroredRows++
                    logger.warn('[SYNC] Row processing error, skipping offer', {
                        context: 'SYNC',
                        provider: provider.name,
                        country: country?.code,
                        service: p.service,
                        error: rowErr?.message
                    })
                }
            }
        }

        const isGlobalSync = (provider as any).useGlobalSync === true

        if (isGlobalSync) {
            logger.info('Using Single-Fetch optimization (Global Prices)', {
                context: 'SYNC',
                provider: provider.name
            })
            try {
                const prices = await engine.getPrices()
                await processPrices(prices)
            } catch (e: any) {
                // Global-sync failure should fall through to per-country rather
                // than abort the whole provider sync.
                logger.warn('[SYNC] Global getPrices() failed, falling back to per-country', {
                    context: 'SYNC',
                    provider: provider.name,
                    error: e?.message
                })
                const rateLimits = getProviderRateLimits(provider)
                const limiter = new RateLimitedQueue(rateLimits.concurrency, rateLimits.interval)
                const promises = countries.map(c => limiter.add(async () => {
                    try {
                        const prices = await engine.getPrices(c.code)
                        if (prices.length > 0) await processPrices(prices, c)
                    } catch (perCountryErr: any) {
                        logger.warn('Failed to fetch prices for country', {
                            context: 'SYNC',
                            provider: provider.name,
                            country: c.code,
                            requestId: getTraceId(),
                            error: perCountryErr?.message
                        })
                    }
                }))
                await Promise.all(promises)
            }
        } else {
            const rateLimits = getProviderRateLimits(provider)
            const limiter = new RateLimitedQueue(rateLimits.concurrency, rateLimits.interval)
            const promises = countries.map(country => limiter.add(async () => {
                try {
                    const prices = await engine.getPrices(country.code)
                    if (prices.length > 0) {
                        await processPrices(prices, country)
                    }
                } catch (e) {
                    logger.warn('Failed to fetch prices for country', {
                        context: 'SYNC',
                        provider: provider.name,
                        country: country.code,
                        requestId: getTraceId(),
                        error: (e as any).message
                    })
                }
            }))
            await Promise.all(promises)
        }

        const allOffers = Array.from(allOffersMap.values())
        const duplicateCount = (pricesCount - allOffers.length)

        if (duplicateCount > 0) {
            logger.warn(`Deduplicated ${duplicateCount} offers during sync`, {
                context: 'SYNC',
                provider: provider.name,
                totalBefore: pricesCount,
                totalAfter: allOffers.length
            })
        }

        // Pricing summary log — single line for observability & admin dashboards
        if (filteredZeroCount > 0 || filteredBelowMinCount > 0 || filteredAboveMaxCount > 0 || noServiceNameCount > 0 || noCountryNameCount > 0 || erroredRows > 0) {
            logger.info(`[SYNC] Pricing complete (filtered ${filteredZeroCount} zero, ${filteredBelowMinCount} below $${minPriceUsd}, ${filteredAboveMaxCount} above $${maxPriceUsd}, ${noServiceNameCount} no-service-name, ${noCountryNameCount} no-country-name, ${erroredRows} errors)`, {
                context: 'SYNC',
                provider: provider.name,
                totalOffers: pricesCount,
                indexed: allOffers.length,
                filteredZeroCost: filteredZeroCount,
                filteredBelowMin: filteredBelowMinCount,
                filteredAboveMax: filteredAboveMaxCount,
                noServiceName: noServiceNameCount,
                noCountryName: noCountryNameCount,
                erroredRows,
            })
        }

        // 4. Indexing (Chunked for Memory Efficiency)
        if (allOffers.length > 0) {
            // SAFETY: Only wipe existing data if we actually have new data to replace it with
            if (!options?.skipWipe) {
                const deleteTaskUid = await deleteOffersByProvider(provider.name)
                if (deleteTaskUid) meiliTaskIds.push(deleteTaskUid)

                logger.debug('Wiped old provider offers (Safety Check Passed)', {
                    context: 'SYNC',
                    provider: provider.name
                })
            }

            logger.info('Indexing offers in chunks', {
                context: 'SYNC',
                provider: provider.name,
                offerCount: allOffers.length
            })

            // Professional Note: We avoid shadow indexing for per-provider updates to minimize memory overhead.
            // We rely on MeiliSearch's atomic document replacement (primaryKey) for consistency.
            const CHUNK_SIZE = 5000
            for (let i = 0; i < allOffers.length; i += CHUNK_SIZE) {
                const chunk = allOffers.slice(i, i + CHUNK_SIZE)
                const taskUid = await indexOffers(chunk)
                if (taskUid) meiliTaskIds.push(taskUid)

                logger.debug('Indexed chunk', {
                    context: 'SYNC',
                    provider: provider.name,
                    chunk: Math.floor(i / CHUNK_SIZE) + 1,
                    totalChunks: Math.ceil(allOffers.length / CHUNK_SIZE)
                })
            }
        }

        // 5. WAIT FOR MEILISEARCH (Crucial for aggregate consistency)
        if (meiliTaskIds.length > 0) {
            logger.info('Waiting for MeiliSearch indexing tasks to complete', {
                context: 'SYNC',
                provider: provider.name,
                taskCount: meiliTaskIds.length
            })
            await waitForTasks(meiliTaskIds)
        }

    } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
        logger.error('Dynamic provider sync failure', {
            context: 'SYNC',
            provider: provider.name,
            error
        })
    }

    // Update final status
    await prisma.provider.update({
        where: { id: provider.id },
        data: {
            syncStatus: error ? 'failed' : 'success',
            lastSyncAt: new Date(),
            count: { increment: 1 }
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
        // ENSURE INDEX HEALTH: Always re-apply settings before sync to prevent search breakage 
        // if indexes were recently wiped or settings were lost.
        const { reconfigureIndexes } = await import('@/lib/search/search')
        await reconfigureIndexes()

        // RESILIENCE: Fetch use_global_sync via raw SQL to bypass Prisma schema sync issues in production.
        // SAFETY: $1 is parameterized; provider.id is server-controlled (from DB), not user input — no SQL injection.
        const raw = await prisma.$queryRawUnsafe<Array<{ use_global_sync: boolean }>>(`SELECT use_global_sync FROM providers WHERE id = $1`, provider.id)
        if (raw && raw[0]) {
            (provider as any).useGlobalSync = raw[0].use_global_sync || false
        }
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

        // Senior-Level: Use Node 20+ ESM loaders for workers. 
        // We use a dynamic import to satisfy Turbopack during the Next.js build phase.
        import('node:worker_threads').then(({ Worker }) => {
            const worker = new Worker(workerPath, {
                execArgv: ['--import', 'tsx', '-r', 'dotenv/config'],
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
        }).catch(reject)
    })
}

export async function syncAllProviders(): Promise<SyncResult[]> {
    logger.box('System Data Sync');

    const startTime = Date.now();

    // Refresh exchange rates first to ensure accurate margins
    try {
        await getCurrencyService().syncRates()
    } catch (e) {
        logger.error('Failed to sync exchange rates during provider sync', {
            context: 'SYNC',
            error: (e as any).message
        })
    }

    const results: SyncResult[] = []
    const syncTarget = process.env.SYNC_PROVIDER
    const allProviders = await prisma.provider.findMany({ where: { isActive: true } })
    const providers = syncTarget
        ? allProviders.filter(p => p.name.toLowerCase() === syncTarget.toLowerCase())
        : allProviders

    if (providers.length === 0) {
        logger.warn('No active providers found for target sync', {
            context: 'SYNC',
            target: syncTarget
        })
        return []
    }

    // Professional: Process Isolation
    // High-volume providers are synced in parallel workers
    const syncPromises = providers.map(async (provider) => {
        try {
            // Senior-Level Optimization: In production standalone mode, tsx loader is unavailable.
            // We run the sync in-process for stability. In development, we keep workers for isolation.
            let result: SyncResult;
            if (process.env.NODE_ENV === 'production') {
                logger.info('Running provider sync in-process (Production Mode)', {
                    context: 'SYNC',
                    provider: provider.name
                })
                result = await syncProviderData(provider.name)
            } else {
                result = await startWorkerSync(provider.name)
            }
            results.push(result)
        } catch (e) {
            logger.error('Failed to sync provider', {
                context: 'SYNC',
                provider: provider.name,
                error: (e as any).message
            })
        }
    })

    await Promise.all(syncPromises)

    // 4. Refresh precomputed aggregates for fast list responses
    logger.info('Refreshing service aggregates', { context: 'SYNC' })
    try {
        await refreshAllServiceAggregates()
    } catch (e) {
        logger.error('Failed to refresh aggregates', {
            context: 'SYNC',
            error: (e as any).message
        })
    }

    // 5. Sync Service Icons (Universal Advanced Manager)
    logger.info('Starting advanced icon synchronization', { context: 'SYNC' })
    try {
        const { ProviderIconManager } = await import('./icon-manager')
        const iconManager = new ProviderIconManager()
        await iconManager.syncAllProviders()
    } catch (e) {
        logger.error('Failed to sync service icons', {
            context: 'SYNC',
            error: (e as any).message
        })
    }

    const totalDuration = Date.now() - startTime;
    logger.success('Full provider sync completed', { context: 'SYNC', durationMs: totalDuration })

    // Heartbeat: marks the scheduled_sync worker as alive.
    recordHeartbeat('scheduled_sync', Date.now())

    // Clear the banned hashes cache so the next sync fetches fresh data
    clearBannedHashesCache()

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
    logger.info('Starting provider sync scheduler', { context: 'SYNC', interval: '12 hours' })
    const safeSync = () =>
        syncAllProviders().catch(e => {
            // Record heartbeat even on full failure so the zombie-detector
            // does not false-alarm — alertmanager will surface the error.
            recordHeartbeat('scheduled_sync', Date.now())
            logger.error('Sync scheduler execution failed', { error: e.message })
        })
    safeSync()
    syncIntervalId = setInterval(safeSync, 12 * 60 * 60 * 1000)
}

export function stopSyncScheduler() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId)
        syncIntervalId = null
    }
}
