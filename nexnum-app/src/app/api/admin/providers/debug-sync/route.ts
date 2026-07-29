import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { meili, INDEXES, OfferDocument } from '@/lib/search/search'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import {
    getCanonicalName,
    generateCanonicalCode,
    normalizeCountryName
} from '@/lib/normalizers/service-identity'
import { PricingConfig } from '@/config/app.config'
import { PricingService } from '@/lib/pricing/pricing-service'
import { getCurrencyService } from '@/lib/currency/currency-service'
import { getCountryFlagUrlSync } from '@/lib/normalizers/country-flags'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes timeout

interface SyncAuditStats {
    provider: string
    rawApiPairs: number
    parsedPriceObjects: number
    validOffers: number
    indexedDocuments: number
    zeroCostCount: number
    unlistedCountryCount: number
    unlistedServiceCount: number
    noCountryNameCount: number
    noServiceNameCount: number
    priceOutOfBoundsCount: number
    stockGtZeroCount: number
    stockZeroCount: number
    durationMs: number
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const providerParam = (searchParams.get('provider') || '5simnet').toLowerCase().trim()
    const clearOld = searchParams.get('clearOld') !== 'false' && searchParams.get('clear') !== 'false'
    const countryFilter = (searchParams.get('country') || '').toLowerCase().trim()
    const format = (searchParams.get('format') || 'html').toLowerCase()

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            const isHtml = format === 'html'

            const send = (msg: string) => {
                if (isHtml) {
                    controller.enqueue(encoder.encode(`<script>appendLog(${JSON.stringify(msg)});</script>\n`))
                } else {
                    controller.enqueue(encoder.encode(msg + '\n'))
                }
            }

            const sendHeader = () => {
                if (isHtml) {
                    const initialHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexNum Enterprise Provider Sync Debugger</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: #0d1117;
            color: #c9d1d9;
            font-family: 'JetBrains Mono', 'Fira Code', 'Segoe UI', monospace;
            padding: 20px;
            font-size: 13px;
            line-height: 1.6;
        }
        .header {
            background: linear-gradient(135deg, #1f2937, #111827);
            border: 1px solid #374151;
            padding: 16px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        }
        .title { color: #60a5fa; font-size: 18px; font-weight: bold; margin-bottom: 6px; }
        .subtitle { color: #9ca3af; font-size: 12px; }
        .terminal {
            background-color: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 16px;
            min-height: 500px;
            max-height: 80vh;
            overflow-y: auto;
            white-space: pre-wrap;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
        }
        .log-line { margin-bottom: 4px; }
        .accent { color: #38bdf8; font-weight: bold; }
        .success { color: #4ade80; font-weight: bold; }
        .warn { color: #fbbf24; font-weight: bold; }
        .error { color: #f87171; font-weight: bold; }
        .table-header { color: #a78bfa; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">⚡ NexNum Provider Sync & Pricing Loss Debugger</div>
        <div class="subtitle">Target Provider: <span class="accent">${providerParam.toUpperCase()}</span> | Clear Old Data: <span class="warn">${clearOld ? 'YES' : 'NO'}</span> | Mode: <span class="success">Live SSE Stream</span></div>
    </div>
    <div id="terminal" class="terminal"></div>
    <script>
        const term = document.getElementById('terminal');
        function appendLog(msg) {
            const div = document.createElement('div');
            div.className = 'log-line';
            
            let formatted = msg
                .replace(/([✅🟢✨])/g, '<span class="success">$1</span>')
                .replace(/([⚠️🟡⚡])/g, '<span class="warn">$1</span>')
                .replace(/([❌🔴💥])/g, '<span class="error">$1</span>')
                .replace(/(\\[SYNC[^\\]]*\\])/g, '<span class="accent">$1</span>')
                .replace(/(=== [^=]+ ===)/g, '<span class="table-header">$1</span>');
                
            div.innerHTML = formatted;
            term.appendChild(div);
            term.scrollTop = term.scrollHeight;
        }
    </script>
`
                    controller.enqueue(encoder.encode(initialHtml))
                }
            }

            try {
                sendHeader()

                const startTime = Date.now()
                send(`🚀 [${new Date().toISOString()}] Initializing Debug Sync Session...`)
                send(`🔍 Environment Settings: minPrice=$${PricingConfig.minPrice} USD, maxPrice=$${PricingConfig.maxPrice} USD`)

                // 1. Fetch Target Providers
                let targetProviders: any[] = []
                if (providerParam === 'all') {
                    targetProviders = await prisma.provider.findMany({ where: { isActive: true } })
                } else {
                    const p = await prisma.provider.findFirst({
                        where: {
                            OR: [
                                { name: { equals: providerParam, mode: 'insensitive' } },
                                { displayName: { equals: providerParam, mode: 'insensitive' } },
                                { id: providerParam }
                            ]
                        }
                    })
                    if (p) targetProviders = [p]
                }

                if (targetProviders.length === 0) {
                    send(`❌ ERROR: No active provider matching '${providerParam}' was found in Database!`)
                    controller.close()
                    return
                }

                send(`✅ Found ${targetProviders.length} target provider(s): ${targetProviders.map(p => p.name).join(', ')}`)

                // Pre-cache currency rates & settings
                const currencyService = getCurrencyService()
                const systemSettings = await currencyService.getSettings()
                const rates = await currencyService.getAllRates()
                const standardRates = rates as Record<string, number>
                const pointsRate = Number(systemSettings.pointsRate)

                // Pre-cache DB Lookups (5,500+ services, 650+ countries)
                send(`📚 Pre-loading Central Service & Country Registry lookups from PostgreSQL...`)
                const allServiceIds = await prisma.serviceLookup.findMany({ select: { serviceCode: true, serviceName: true, serviceId: true } })
                const allCountryIds = await prisma.countryLookup.findMany({ select: { countryCode: true, countryName: true, countryId: true } })

                const serviceCodeToNumeric = new Map<string, number>()
                const serviceMap = new Map<string, string>()
                for (const s of allServiceIds) {
                    serviceMap.set(s.serviceCode, s.serviceName)
                    serviceMap.set(s.serviceCode.toLowerCase(), s.serviceName)
                    const setIfAbsent = (k: string, id: number) => { if (k && !serviceCodeToNumeric.has(k)) serviceCodeToNumeric.set(k, id) }
                    setIfAbsent(s.serviceCode, s.serviceId)
                    setIfAbsent(s.serviceCode.toLowerCase(), s.serviceId)
                    setIfAbsent(s.serviceName.toLowerCase(), s.serviceId)
                    setIfAbsent(generateCanonicalCode(s.serviceName), s.serviceId)
                }

                const countryCodeToNumeric = new Map<string, number>()
                const countryNameMap = new Map<string, string>()
                for (const c of allCountryIds) {
                    countryNameMap.set(c.countryCode, c.countryName)
                    countryNameMap.set(c.countryCode.toLowerCase(), c.countryName)
                    const setIfAbsent = (k: string, id: number) => { if (k && !countryCodeToNumeric.has(k)) countryCodeToNumeric.set(k, id) }
                    setIfAbsent(c.countryCode, c.countryId)
                    setIfAbsent(c.countryCode.toLowerCase(), c.countryId)
                    setIfAbsent(c.countryName.toLowerCase(), c.countryId)
                    setIfAbsent(generateCanonicalCode(c.countryName), c.countryId)
                    setIfAbsent(normalizeCountryName(c.countryName).toLowerCase(), c.countryId)
                }

                send(`✅ Loaded ${allServiceIds.length} services and ${allCountryIds.length} countries from DB lookups.`)

                // Sync each provider
                for (const provider of targetProviders) {
                    const pStart = Date.now()
                    send(`\n========================================================================================`)
                    send(`🔄 STARTING DIAGNOSTIC TRACE FOR PROVIDER: [${provider.name.toUpperCase()}]`)
                    send(`========================================================================================`)

                    // STEP 1: CLEAR OLD DATA IN MEILISEARCH IF REQUESTED
                    if (clearOld) {
                        send(`🧹 Step 1: Clearing existing documents in MeiliSearch for provider '${provider.name}'...`)
                        try {
                            const index = meili.index(INDEXES.OFFERS)
                            if (providerParam === 'all') {
                                const task = await index.deleteAllDocuments()
                                send(`✅ Sent deleteAllDocuments request to MeiliSearch (Task UID: ${task.taskUid})`)
                            } else {
                                const task = await index.deleteDocuments({ filter: `provider = "${provider.name}"` })
                                send(`✅ Sent deleteDocuments request for filter 'provider = "${provider.name}"' (Task UID: ${task.taskUid})`)
                            }
                        } catch (e: any) {
                            send(`⚠️ MeiliSearch Clear Warning: ${e.message}`)
                        }
                    }

                    // STEP 2: INSTANTIATE DYNAMIC PROVIDER
                    send(`📡 Step 2: Initializing DynamicProvider instance...`)
                    const dynamicProvider = new DynamicProvider(provider as any)

                    // STEP 3: FETCH METADATA (COUNTRIES & SERVICES)
                    send(`🌐 Step 3: Fetching Static Metadata (getCountriesList & getServicesList)...`)
                    let countries: any[] = []
                    let services: any[] = []
                    try {
                        countries = await dynamicProvider.getCountriesList()
                        send(`   - getCountriesList(): ${countries.length} countries returned`)
                    } catch (e: any) {
                        send(`   - getCountriesList(): Failed/Skipped (${e.message})`)
                    }

                    try {
                        services = await dynamicProvider.getServicesList('')
                        if ((!services || services.length === 0) && countries.length > 0) {
                            services = await dynamicProvider.getServicesList(countries[0].code)
                        }
                        send(`   - getServicesList(): ${services.length} static services returned`)
                    } catch (e: any) {
                        send(`   - getServicesList(): Failed/Skipped (${e.message})`)
                    }

                    // Build whitelist sets
                    const validCountryCodes = new Set<string>()
                    for (const c of countries) {
                        if (c.code) {
                            validCountryCodes.add(String(c.code).toLowerCase().trim())
                            const clean = String(c.code).toLowerCase().replace(/[^a-z0-9]/g, '')
                            if (clean) validCountryCodes.add(clean)
                        }
                    }

                    const validServiceCodes = new Set<string>()
                    for (const s of services) {
                        if (s.code) {
                            validServiceCodes.add(String(s.code).toLowerCase().trim())
                            const clean = String(s.code).toLowerCase().replace(/[^a-z0-9]/g, '')
                            if (clean) validServiceCodes.add(clean)
                        }
                    }

                    send(`✅ Whitelist sets built: ${validCountryCodes.size} country keys, ${validServiceCodes.size} service keys`)

                    // STEP 4: FETCH RAW PRICES
                    send(`⚡ Step 4: Fetching live prices from Upstream Provider...`)
                    const apiFetchStart = Date.now()
                    let rawPrices: any[] = []
                    try {
                        rawPrices = await dynamicProvider.getPrices()
                        send(`✅ Raw Price Fetch completed in ${Date.now() - apiFetchStart}ms. Total PriceData objects parsed: ${rawPrices.length}`)
                    } catch (e: any) {
                        send(`❌ Upstream Price Fetch Error: ${e.message}`)
                        continue
                    }

                    if (rawPrices.length === 0) {
                        send(`⚠️ Provider returned 0 price entries! Check provider balance or API configuration.`)
                        continue
                    }

                    // STEP 5: PIPELINE TRACE & TRANSFORMATION AUDIT
                    send(`📊 Step 5: Auditing Offer Transformation Pipeline (Raw -> MeiliSearch Documents)...`)

                    let rawPairsCount = rawPrices.length
                    let zeroCostCount = 0
                    let unlistedCountryCount = 0
                    let unlistedServiceCount = 0
                    let noCountryNameCount = 0
                    let noServiceNameCount = 0
                    let priceOutOfBoundsCount = 0
                    let stockGtZeroCount = 0
                    let stockZeroCount = 0

                    const sampleUnresolvedCountries: string[] = []
                    const sampleUnresolvedServices: string[] = []

                    const allOffersMap = new Map<string, OfferDocument>()
                    const providerCurrency = (provider.currency || 'USD').toUpperCase()
                    const depositCurrency = (provider.depositCurrency || 'USD').toUpperCase()

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

                    // Group price records by (countryCode, serviceCode)
                    const groupedPrices = new Map<string, any[]>()
                    for (const p of rawPrices) {
                        const countryCode = p.country || ''
                        const serviceCode = p.service || ''

                        if (countryFilter) {
                            const cLower = String(countryCode).toLowerCase()
                            if (cLower !== countryFilter && !cLower.includes(countryFilter)) continue
                        }

                        // Whitelist checks
                        const normCty = String(countryCode).toLowerCase().trim()
                        const cleanCty = normCty.replace(/[^a-z0-9]/g, '')
                        const isValidCty = !validCountryCodes.size || validCountryCodes.has(normCty) ||
                            validCountryCodes.has(cleanCty) ||
                            countryCodeToNumeric.has(normCty) ||
                            countryCodeToNumeric.has(cleanCty)

                        if (!isValidCty) unlistedCountryCount++

                        const normSvc = String(serviceCode).toLowerCase().trim()
                        const cleanSvc = normSvc.replace(/[^a-z0-9]/g, '')
                        const isValidSvc = !validServiceCodes.size || validServiceCodes.has(normSvc) ||
                            validServiceCodes.has(cleanSvc) ||
                            serviceCodeToNumeric.has(normSvc) ||
                            serviceCodeToNumeric.has(cleanSvc)

                        if (!isValidSvc) unlistedServiceCount++

                        if (!Number.isFinite(p.cost) || p.cost <= 0) {
                            zeroCostCount++
                            continue
                        }

                        const groupKey = `${normCty}_${normSvc}`
                        if (!groupedPrices.has(groupKey)) groupedPrices.set(groupKey, [])
                        groupedPrices.get(groupKey)!.push(p)
                    }

                    // Process grouped offers
                    for (const [, priceItems] of groupedPrices.entries()) {
                        const sample = priceItems[0]
                        const countryCode = sample.country
                        const serviceCode = sample.service

                        let svcName = (serviceMap.get(serviceCode) || serviceMap.get(serviceCode.toLowerCase()) || sample.service || serviceCode || '').trim()
                        if (!svcName) {
                            noServiceNameCount++
                            if (sampleUnresolvedServices.length < 5) sampleUnresolvedServices.push(serviceCode)
                            continue
                        }

                        const resolvedCountryName = (countryNameMap.get(countryCode) || sample.country || '').trim()
                        if (!resolvedCountryName || resolvedCountryName.toLowerCase() === 'unknown') {
                            noCountryNameCount++
                            if (sampleUnresolvedCountries.length < 5) sampleUnresolvedCountries.push(countryCode)
                            continue
                        }

                        const canonicalCtyName = normalizeCountryName(resolvedCountryName)
                        const canonicalSvcName = getCanonicalName(svcName) || svcName
                        const canonicalSvcCode = generateCanonicalCode(canonicalSvcName)
                        const canonicalCtyCode = generateCanonicalCode(canonicalCtyName)

                        let totalGroupStock = 0
                        const candidatesList: any[] = []

                        for (const item of priceItems) {
                            const rawCostNum = Number(item.cost)
                            const pricing = PricingService.compute({
                                rawCost: rawCostNum,
                                providerCurrency,
                                provider: providerCfg,
                                standardRates,
                                pointsRate,
                                isPointsMode: true,
                            })

                            if (!pricing) continue

                            if (pricing.costUsd < PricingConfig.minPrice || pricing.sellUsd > PricingConfig.maxPrice) {
                                priceOutOfBoundsCount++
                                continue
                            }

                            const stockCount = Math.max(0, Number(item.count || 0))
                            totalGroupStock += stockCount

                            const operatorName = (item.operator && String(item.operator).trim()) ? String(item.operator).trim() : 'any'
                            candidatesList.push({
                                candidateId: `${provider.name}_${canonicalCtyCode}_${canonicalSvcCode}_${operatorName}`,
                                provider: provider.name,
                                operator: operatorName,
                                providerServiceCode: String(item.service),
                                providerCountryCode: String(item.country),
                                pointPrice: pricing.pointPrice,
                                rawCost: rawCostNum,
                                rawCurrency: providerCurrency,
                                costUsd: pricing.costUsd,
                                sellUsd: pricing.sellUsd,
                                stock: stockCount,
                            })
                        }

                        if (candidatesList.length === 0) continue

                        candidatesList.sort((a, b) => {
                            if (a.stock > 0 && b.stock === 0) return -1
                            if (a.stock === 0 && b.stock > 0) return 1
                            return a.pointPrice - b.pointPrice
                        })

                        const bestCandidate = candidatesList[0]
                        if (totalGroupStock > 0) stockGtZeroCount++
                        else stockZeroCount++

                        const offerDoc: OfferDocument = {
                            id: `${provider.name}_${canonicalCtyCode}_${canonicalSvcCode}`,
                            provider: provider.name,
                            serviceId: serviceCodeToNumeric.get(canonicalSvcCode),
                            countryId: countryCodeToNumeric.get(canonicalCtyCode),
                            serviceName: canonicalSvcName,
                            countryName: canonicalCtyName,
                            serviceCode: canonicalSvcCode,
                            countryCode: canonicalCtyCode,
                            providerServiceCode: String(serviceCode),
                            providerCountryCode: String(countryCode),
                            pointPrice: bestCandidate.pointPrice,
                            rawPrice: bestCandidate.rawCost,
                            currencyPrices: {
                                USD: bestCandidate.sellUsd,
                                POINTS: bestCandidate.pointPrice
                            },
                            purchaseCandidates: candidatesList,
                            stock: totalGroupStock,
                            operator: bestCandidate.operator,
                            countryIcon: getCountryFlagUrlSync(canonicalCtyName) || '',
                            isActive: true,
                            lastSyncedAt: Date.now()
                        }

                        allOffersMap.set(offerDoc.id, offerDoc)
                    }

                    const finalOffersList = Array.from(allOffersMap.values())
                    send(`✅ Step 5 Completed: Transformed raw data into ${finalOffersList.length} unique MeiliSearch Offer Documents.`)

                    // STEP 6: MEILISEARCH INDEXING
                    send(`🚀 Step 6: Indexing ${finalOffersList.length} documents into MeiliSearch index '${INDEXES.OFFERS}'...`)
                    const index = meili.index(INDEXES.OFFERS)
                    const chunkSize = 5000
                    let indexedCount = 0

                    for (let i = 0; i < finalOffersList.length; i += chunkSize) {
                        const chunk = finalOffersList.slice(i, i + chunkSize)
                        const task = await index.addDocuments(chunk)
                        indexedCount += chunk.length
                        send(`   - Enqueued chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(finalOffersList.length / chunkSize)} (${chunk.length} docs, Task UID: ${task.taskUid})`)
                    }

                    const pDuration = Date.now() - pStart

                    // STEP 7: PRINT DIAGNOSTIC SUMMARY TABLE
                    const stats: SyncAuditStats = {
                        provider: provider.name,
                        rawApiPairs: rawPairsCount,
                        parsedPriceObjects: rawPrices.length,
                        validOffers: finalOffersList.length,
                        indexedDocuments: indexedCount,
                        zeroCostCount,
                        unlistedCountryCount,
                        unlistedServiceCount,
                        noCountryNameCount,
                        noServiceNameCount,
                        priceOutOfBoundsCount,
                        stockGtZeroCount,
                        stockZeroCount,
                        durationMs: pDuration
                    }

                    const retentionRate = rawPairsCount > 0 ? ((finalOffersList.length / rawPairsCount) * 100).toFixed(2) : '100.00'

                    send(`\n========================================================================================`)
                    send(`                   DATA PIPELINE RETENTION AUDIT REPORT: ${provider.name.toUpperCase()}`)
                    send(`========================================================================================`)
                    send(`📊 Stage 1: Raw API Pairs Received  ......................... ${stats.rawApiPairs.toLocaleString()}`)
                    send(`📊 Stage 2: Parsed PriceData Objects ........................ ${stats.parsedPriceObjects.toLocaleString()}`)
                    send(`📊 Stage 3: Transformed Offer Documents .................... ${stats.validOffers.toLocaleString()}`)
                    send(`📊 Stage 4: Enqueued to MeiliSearch ......................... ${stats.indexedDocuments.toLocaleString()}`)
                    send(`----------------------------------------------------------------------------------------`)
                    send(`✨ DATA RETENTION RATE: ${retentionRate}% (${stats.validOffers.toLocaleString()} / ${stats.rawApiPairs.toLocaleString()} offers retained)`)
                    send(`----------------------------------------------------------------------------------------`)
                    send(`📦 Active In-Stock Offers (stock > 0): ........................ ${stats.stockGtZeroCount.toLocaleString()}`)
                    send(`📦 Zero-Stock Restock Offers (stock = 0): ...................... ${stats.stockZeroCount.toLocaleString()}`)
                    send(`----------------------------------------------------------------------------------------`)
                    send(`ℹ️ Soft-Filtered Unlisted Countries (Auto-Included): .......... ${stats.unlistedCountryCount.toLocaleString()}`)
                    send(`ℹ️ Soft-Filtered Unlisted Services (Auto-Included): ........... ${stats.unlistedServiceCount.toLocaleString()}`)
                    send(`🛑 Dropped Invalid/Zero Cost (cost <= 0): .................... ${stats.zeroCostCount.toLocaleString()}`)
                    send(`🛑 Dropped Price Out-of-Bounds (<$${PricingConfig.minPrice} / >$${PricingConfig.maxPrice}): .. ${stats.priceOutOfBoundsCount.toLocaleString()}`)
                    send(`❌ Dropped Unresolvable Country Names: ....................... ${stats.noCountryNameCount.toLocaleString()} ${sampleUnresolvedCountries.length ? '(Samples: ' + sampleUnresolvedCountries.join(', ') + ')' : ''}`)
                    send(`❌ Dropped Unresolvable Service Names: ....................... ${stats.noServiceNameCount.toLocaleString()} ${sampleUnresolvedServices.length ? '(Samples: ' + sampleUnresolvedServices.join(', ') + ')' : ''}`)
                    send(`⏱️ Total Provider Sync Duration: ............................. ${pDuration}ms`)
                    send(`========================================================================================\n`)
                }

                send(`✨ [${new Date().toISOString()}] FULL DIAGNOSTIC SYNC COMPLETE IN ${Date.now() - startTime}ms.`)
                controller.close()
            } catch (error: any) {
                send(`❌ FATAL ERROR DURING DIAGNOSTIC SYNC: ${error.stack || error.message || error}`)
                controller.close()
            }
        }
    })

    const contentType = format === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'

    return new Response(stream, {
        headers: {
            'Content-Type': contentType,
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no'
        }
    })
}
