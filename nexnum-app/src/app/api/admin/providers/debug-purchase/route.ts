import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { meili, INDEXES, OfferDocument } from '@/lib/search/search'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { smsProvider } from '@/lib/providers'
import { PricingConfig } from '@/config/app.config'
import { PricingService } from '@/lib/pricing/pricing-service'
import { getCurrencyService } from '@/lib/currency/currency-service'
import { getCanonicalName, generateCanonicalCode, normalizeCountryName } from '@/lib/normalizers/service-identity'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes timeout

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const providerParam = (searchParams.get('provider') || '5simnet').toLowerCase().trim()
    const countryParam = (searchParams.get('country') || 'indonesia').toLowerCase().trim()
    const serviceParam = (searchParams.get('service') || 'discord').toLowerCase().trim()
    const operatorParam = (searchParams.get('operator') || 'any').toLowerCase().trim()
    const isDryRun = searchParams.get('mode') !== 'live_buy'
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

            const sendEvent = (event: string, payload: any) => {
                if (isHtml) {
                    controller.enqueue(encoder.encode(`<script>handleEvent(${JSON.stringify(event)}, ${JSON.stringify(payload)});</script>\n`))
                }
            }

            const sendHeader = () => {
                if (isHtml) {
                    const initialHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexNum Enterprise Purchase Flow Debugger</title>
    <style>
        :root {
            --bg-color: #0b0f19;
            --panel-bg: #111827;
            --border-color: #1f2937;
            --accent-blue: #38bdf8;
            --accent-purple: #c084fc;
            --success-green: #4ade80;
            --warning-amber: #fbbf24;
            --error-red: #f87171;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg-color);
            color: var(--text-primary);
            font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace;
            padding: 24px;
            font-size: 13px;
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        
        /* Top Navigation Header */
        .header {
            background: linear-gradient(135deg, #1e293b, #0f172a);
            border: 1px solid var(--border-color);
            padding: 20px 24px;
            border-radius: 12px;
            margin-bottom: 20px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
        }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo-icon {
            background: linear-gradient(135deg, #f43f5e, #fb7185);
            color: #fff;
            font-weight: 900;
            font-size: 18px;
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 15px rgba(244, 63, 94, 0.4);
        }
        .title { color: var(--text-primary); font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
        .subtitle { color: var(--text-secondary); font-size: 12px; margin-top: 2px; }
        
        .pulse-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: ${isDryRun ? 'rgba(251, 191, 36, 0.1)' : 'rgba(74, 222, 128, 0.1)'};
            border: 1px solid ${isDryRun ? 'rgba(251, 191, 36, 0.3)' : 'rgba(74, 222, 128, 0.3)'};
            color: ${isDryRun ? 'var(--warning-amber)' : 'var(--success-green)'};
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 600;
        }
        .pulse-dot {
            width: 8px; height: 8px;
            background-color: ${isDryRun ? 'var(--warning-amber)' : 'var(--success-green)'};
            border-radius: 50%;
            box-shadow: 0 0 8px ${isDryRun ? 'var(--warning-amber)' : 'var(--success-green)'};
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }

        /* Form Toolbar */
        .toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid var(--border-color);
            padding: 10px 14px;
            border-radius: 10px;
            flex-wrap: wrap;
        }
        .input-box, .select-input, .btn {
            background: #1e293b;
            border: 1px solid #334155;
            color: var(--text-primary);
            padding: 8px 12px;
            border-radius: 6px;
            font-family: inherit;
            font-size: 12px;
            outline: none;
            transition: all 0.2s ease;
        }
        .input-box:focus, .select-input:focus, .btn:hover { border-color: var(--accent-blue); background: #334155; cursor: pointer; }
        .btn-primary { background: #e11d48; color: #fff; border-color: #f43f5e; font-weight: 600; }
        .btn-primary:hover { background: #be123c; box-shadow: 0 0 12px rgba(244, 63, 94, 0.4); }

        /* Stats Cards */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: var(--panel-bg);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 16px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
        }
        .stat-label { color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
        .stat-value { font-size: 20px; font-weight: 700; color: var(--text-primary); }
        .stat-value.blue { color: var(--accent-blue); }
        .stat-value.green { color: var(--success-green); }
        .stat-value.amber { color: var(--warning-amber); }
        .stat-value.rose { color: #f43f5e; }

        /* Terminal Window */
        .terminal {
            background: #090d16;
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            min-height: 520px;
            max-height: 75vh;
            overflow-y: auto;
            white-space: pre-wrap;
            box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.6);
            font-size: 13px;
            line-height: 1.7;
        }
        .log-line { margin-bottom: 4px; display: flex; gap: 8px; flex-wrap: wrap; }
        
        /* Syntax Colors */
        .tag-info { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
        .tag-step { background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
        .tag-success { background: rgba(74, 222, 128, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
        .tag-warn { background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
        .tag-error { background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }

        /* Report Summary Card */
        .report-card {
            background: linear-gradient(135deg, #1f1e38, #0f172a);
            border: 1px solid #4338ca;
            border-radius: 12px;
            padding: 24px;
            margin-top: 20px;
            box-shadow: 0 10px 30px -10px rgba(67, 56, 202, 0.4);
        }
        .report-header { font-size: 16px; font-weight: 700; color: #a5b4fc; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .report-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        .report-table th, .report-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #1e293b; }
        .report-table th { color: var(--text-secondary); font-size: 11px; text-transform: uppercase; }
        .report-table td { font-size: 13px; }
        .payload-code { background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 10px; color: #38bdf8; font-size: 11px; word-break: break-all; }
    </style>
</head>
<body>
    <div class="container">
        <!-- Top Nav -->
        <div class="header">
            <div class="brand">
                <div class="logo-icon">📱</div>
                <div>
                    <div class="title">NexNum Purchase Flow Debugger</div>
                    <div class="subtitle">Live Upstream API, Endpoint URL & Candidate Failover Trace Engine</div>
                </div>
            </div>
            <div class="toolbar">
                <div class="pulse-badge">
                    <span class="pulse-dot"></span> Mode: ${isDryRun ? 'DRY_RUN (Simulated)' : 'LIVE_BUY (Real Order)'}
                </div>
                <input type="text" id="countryInput" class="input-box" value="${countryParam}" placeholder="Country (e.g. indonesia)" style="width:130px;" />
                <input type="text" id="serviceInput" class="input-box" value="${serviceParam}" placeholder="Service (e.g. discord)" style="width:130px;" />
                <select id="providerSelect" class="select-input">
                    <option value="5simnet" ${providerParam === '5simnet' ? 'selected' : ''}>5Simnet</option>
                    <option value="grizzlysms" ${providerParam === 'grizzlysms' ? 'selected' : ''}>GrizzlySMS</option>
                    <option value="smshub" ${providerParam === 'smshub' ? 'selected' : ''}>SMSHub</option>
                    <option value="smsactivate" ${providerParam === 'smsactivate' ? 'selected' : ''}>SMS-Activate</option>
                    <option value="smart" ${providerParam === 'smart' ? 'selected' : ''}>SmartRouter (Auto Best)</option>
                </select>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                    <input type="checkbox" id="liveBuyCheck" ${!isDryRun ? 'checked' : ''} /> Live Buy
                </label>
                <button class="btn btn-primary" onclick="runDebug()">▶ Test Purchase</button>
                <button class="btn" onclick="clearTerminal()">🧹 Clear</button>
                <button class="btn" onclick="copyLogs()">📋 Copy Logs</button>
            </div>
        </div>

        <!-- Live Metric Cards -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Resolved Offer</div>
                <div id="stat-offer" class="stat-value blue">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Point Price</div>
                <div id="stat-price" class="stat-value rose">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Raw Provider Cost</div>
                <div id="stat-raw-cost" class="stat-value amber">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Candidates Evaluated</div>
                <div id="stat-candidates" class="stat-value purple">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Upstream Latency</div>
                <div id="stat-latency" class="stat-value green">-</div>
            </div>
        </div>

        <!-- Live Terminal Window -->
        <div id="terminal" class="terminal"></div>
    </div>

    <script>
        const term = document.getElementById('terminal');
        let autoScroll = true;

        function runDebug() {
            const country = document.getElementById('countryInput').value;
            const service = document.getElementById('serviceInput').value;
            const provider = document.getElementById('providerSelect').value;
            const mode = document.getElementById('liveBuyCheck').checked ? 'live_buy' : 'dry_run';
            window.location.href = '/api/admin/providers/debug-purchase?country=' + country + '&service=' + service + '&provider=' + provider + '&mode=' + mode;
        }

        function clearTerminal() { term.innerHTML = ''; }
        function copyLogs() { navigator.clipboard.writeText(term.innerText); alert('Logs copied!'); }

        function handleEvent(event, payload) {
            if (event === 'stats') {
                if (payload.offerId != null) document.getElementById('stat-offer').innerText = payload.offerId;
                if (payload.pointPrice != null) document.getElementById('stat-price').innerText = payload.pointPrice + ' Pts';
                if (payload.rawCost != null) document.getElementById('stat-raw-cost').innerText = payload.rawCost + ' ' + (payload.currency || '');
                if (payload.candidatesCount != null) document.getElementById('stat-candidates').innerText = payload.candidatesCount;
                if (payload.latencyMs != null) document.getElementById('stat-latency').innerText = payload.latencyMs + 'ms';
            }
        }

        function appendLog(msg) {
            const div = document.createElement('div');
            div.className = 'log-line';

            let content = msg
                .replace(/^\[INFO\]/g, '<span class="tag-info">INFO</span>')
                .replace(/^\[STEP\]/g, '<span class="tag-step">STEP</span>')
                .replace(/^\[SUCCESS\]/g, '<span class="tag-success">SUCCESS</span>')
                .replace(/^\[WARN\]/g, '<span class="tag-warn">WARN</span>')
                .replace(/^\[ERROR\]/g, '<span class="tag-error">ERROR</span>');

            div.innerHTML = content;
            term.appendChild(div);
            if (autoScroll) term.scrollTop = term.scrollHeight;
        }
    </script>
`
                    controller.enqueue(encoder.encode(initialHtml))
                }
            }

            try {
                sendHeader()
                const startTime = Date.now()

                send(`[INFO] Initializing Purchase Diagnostic Trace at ${new Date().toLocaleTimeString()}...`)
                send(`[INFO] Target Parameters: country='${countryParam}', service='${serviceParam}', provider='${providerParam}', operator='${operatorParam}'`)
                send(`[INFO] Mode: ${isDryRun ? 'DRY_RUN (Simulated Request Trace)' : 'LIVE_BUY (Real Upstream Purchase)'}`)

                // 1. Fetch Target Provider
                let targetProvider: any = null
                if (providerParam !== 'smart') {
                    targetProvider = await prisma.provider.findFirst({
                        where: {
                            OR: [
                                { name: { equals: providerParam, mode: 'insensitive' } },
                                { displayName: { equals: providerParam, mode: 'insensitive' } },
                                { id: providerParam }
                            ]
                        }
                    })
                    if (!targetProvider) {
                        send(`[ERROR] Provider '${providerParam}' not found in database!`)
                        controller.close()
                        return
                    }
                    send(`[SUCCESS] Loaded provider configuration for [${targetProvider.name.toUpperCase()}]`)
                }

                // 2. Query MeiliSearch Offer Index
                send(`\n========================================================================================`)
                send(`[STEP 1] QUERYING MEILISEARCH FOR OFFER (country=${countryParam}, service=${serviceParam})`)
                send(`========================================================================================`)
                const index = meili.index(INDEXES.OFFERS)

                let filterStr = `isActive = true`
                if (targetProvider) filterStr += ` AND provider = "${targetProvider.name}"`

                const searchResult = await index.search(`${countryParam} ${serviceParam}`, {
                    filter: filterStr,
                    limit: 10
                })

                send(`[INFO] MeiliSearch returned ${searchResult.hits.length} matching offer candidate(s).`)

                if (searchResult.hits.length === 0) {
                    send(`[WARN] No active offer document found in MeiliSearch for ${countryParam} + ${serviceParam}!`)
                }

                const hit = (searchResult.hits[0] as OfferDocument) || null
                let candidatesList: any[] = []

                if (hit) {
                    send(`[SUCCESS] Resolved Offer: ${hit.id} (${hit.countryName} - ${hit.serviceName})`)
                    send(`   - Point Price: ${hit.pointPrice} Pts | Stock: ${hit.stock} | Provider: ${hit.provider}`)
                    send(`   - Provider Country Code: '${hit.providerCountryCode}' | Provider Service Code: '${hit.providerServiceCode}'`)

                    candidatesList = hit.purchaseCandidates || []
                    send(`[INFO] Total purchase candidates in offer: ${candidatesList.length}`)
                    candidatesList.forEach((c, idx) => {
                        send(`   Candidate #${idx + 1}: operator='${c.operator}', stock=${c.stock}, rawCost=${c.rawCost} ${c.rawCurrency || ''}, pointPrice=${c.pointPrice} Pts`)
                    })
                }

                // 3. Pricing & Financial Computation Audit
                send(`\n========================================================================================`)
                send(`[STEP 2] FINANCIAL & MARGIN CALCULATION AUDIT`)
                send(`========================================================================================`)

                const currencyService = getCurrencyService()
                const systemSettings = await currencyService.getSettings()
                const rates = await currencyService.getAllRates()
                const pointsRate = Number(systemSettings.pointsRate)
                const standardRates = rates as Record<string, number>

                if (targetProvider) {
                    const providerCurrency = (targetProvider.currency || 'USD').toUpperCase()
                    const depositCurrency = (targetProvider.depositCurrency || 'USD').toUpperCase()
                    const providerCfg = {
                        currency: providerCurrency,
                        normalizationMode: String(targetProvider.normalizationMode || 'AUTO'),
                        normalizationRate: targetProvider.normalizationRate,
                        depositSpent: targetProvider.depositSpent,
                        depositReceived: targetProvider.depositReceived,
                        depositCurrency,
                        priceMultiplier: Number(targetProvider.priceMultiplier) || 1.0,
                        fixedMarkup: Number(targetProvider.fixedMarkup) || 0.0,
                    }

                    const sampleRawCost = candidatesList[0]?.rawCost || 5.0
                    const pricing = PricingService.compute({
                        rawCost: sampleRawCost,
                        providerCurrency,
                        provider: providerCfg,
                        standardRates,
                        pointsRate,
                        isPointsMode: true
                    })

                    if (pricing) {
                        send(`[SUCCESS] Pricing Calculation Audit for 1 unit:`)
                        send(`   - Raw Provider Cost: ${pricing.rawCost} ${providerCurrency}`)
                        send(`   - Resolved Exchange Rate: 1 USD = ${pricing.rateUsed} ${providerCurrency} (Source: ${pricing.rateSource})`)
                        send(`   - Computed Base Cost USD: $${pricing.costUsd.toFixed(4)} USD`)
                        send(`   - Price Multiplier: ${targetProvider.priceMultiplier || 1.0}x | Fixed Markup: $${targetProvider.fixedMarkup || 0}`)
                        send(`   - Final Selling USD: $${pricing.sellUsd.toFixed(4)} USD`)
                        send(`   - Final User Point Price: ${pricing.pointPrice} Pts (100 Pts = $1 USD)`)

                        sendEvent('stats', {
                            offerId: hit?.id || `${providerParam}_${countryParam}_${serviceParam}`,
                            pointPrice: pricing.pointPrice,
                            rawCost: pricing.rawCost,
                            currency: providerCurrency,
                            candidatesCount: candidatesList.length
                        })
                    }
                }

                // 4. Upstream Endpoint & Payload Resolution Audit
                send(`\n========================================================================================`)
                send(`[STEP 3] UPSTREAM ENDPOINT & TEMPLATE RESOLUTION AUDIT`)
                send(`========================================================================================`)

                if (targetProvider) {
                    const dynamicProvider = new DynamicProvider(targetProvider as any)
                    const endpoints = (targetProvider.endpoints as Record<string, any>) || {}
                    const getNumberEndpoint = endpoints['getNumber']

                    send(`[INFO] Upstream getNumber Endpoint Config:`)
                    send(`   - Path Template: ${getNumberEndpoint?.path || '/stubs/handler_api.php'}`)
                    send(`   - Method: ${getNumberEndpoint?.method || 'GET'}`)
                    send(`   - Query Params Template: ${JSON.stringify(getNumberEndpoint?.queryParams || {})}`)

                    // 5. Upstream API Call & Candidate Failover Execution Trace
                    send(`\n========================================================================================`)
                    send(`[STEP 4] EXECUTING UPSTREAM API CALL & CANDIDATE FAILOVER TRACE`)
                    send(`========================================================================================`)

                    const providerCountryCode = hit?.providerCountryCode || countryParam
                    const providerServiceCode = hit?.providerServiceCode || serviceParam

                    if (candidatesList.length === 0) {
                        candidatesList = [{ operator: operatorParam || 'any', stock: 1, rawCost: 5.0 }]
                    }

                    let purchaseSuccess = false
                    let successResult: any = null
                    let lastUpstreamUrl = ''
                    let lastRawResponse = ''

                    for (let i = 0; i < candidatesList.length; i++) {
                        const cand = candidatesList[i]
                        const candOp = cand.operator || operatorParam || 'any'
                        const candStart = Date.now()

                        send(`[INFO] Attempting Candidate #${i + 1}/${candidatesList.length} (operator='${candOp}', stock=${cand.stock})...`)

                        // Construct upstream URL
                        const baseUrl = targetProvider.baseUrl || 'http://api1.5sim.net'
                        const path = getNumberEndpoint?.path || '/stubs/handler_api.php'
                        const apiKey = targetProvider.apiKey || 'REDACTED_KEY'

                        const queryParams = new URLSearchParams({
                            action: 'getNumber',
                            country: String(providerCountryCode),
                            service: String(providerServiceCode),
                            operator: candOp,
                            api_key: apiKey
                        })

                        const fullUrl = `${baseUrl}${path}?${queryParams.toString()}`
                        const maskedUrl = fullUrl.replace(apiKey, apiKey.substring(0, 6) + '***')
                        lastUpstreamUrl = maskedUrl

                        send(`   - Request URL: GET ${maskedUrl}`)

                        if (isDryRun) {
                            send(`   - Mode: DRY_RUN (Skipping real upstream deduction call)`)
                            send(`   - Verifying API Endpoint reachability & parse mapping...`)
                            
                            // Test balance or health endpoint to verify API key
                            try {
                                const balStart = Date.now()
                                const balance = await dynamicProvider.getBalance()
                                send(`   [SUCCESS] Upstream API Key Verified! Active Provider Balance: ${balance}`)
                                purchaseSuccess = true
                                successResult = {
                                    activationId: 'DRY_RUN_ACTIVATION_' + Date.now(),
                                    phoneNumber: '+1234567890 (Simulated)',
                                    provider: targetProvider.name,
                                    serviceCode: providerServiceCode,
                                    countryCode: providerCountryCode,
                                    operator: candOp
                                }
                                sendEvent('stats', { latencyMs: Date.now() - balStart })
                                break
                            } catch (balErr: any) {
                                send(`   [WARN] Upstream Balance Check Failed: ${balErr.message}`)
                                lastRawResponse = balErr.message
                            }
                        } else {
                            // LIVE BUY
                            try {
                                send(`   ⚡ Dispatching LIVE GET request to ${targetProvider.name.toUpperCase()}...`)
                                const result = await dynamicProvider.getNumber(providerCountryCode, providerServiceCode, {
                                    operator: candOp
                                })
                                const candLatency = Date.now() - candStart
                                send(`   [SUCCESS] Live Purchase Successful in ${candLatency}ms!`)
                                send(`   - Activated Number: ${result.phoneNumber}`)
                                send(`   - Activation ID: ${result.activationId}`)
                                purchaseSuccess = true
                                successResult = result
                                sendEvent('stats', { latencyMs: candLatency })
                                break
                            } catch (buyErr: any) {
                                const candLatency = Date.now() - candStart
                                send(`   [WARN] Candidate #${i + 1} (${candOp}) Failed in ${candLatency}ms: ${buyErr.message}`)
                                lastRawResponse = buyErr.message
                            }
                        }
                    }

                    const totalDuration = Date.now() - startTime

                    // STEP 5: EXECUTIVE REPORT CARD
                    if (isHtml) {
                        const reportCardHtml = `
<div class="report-card">
    <div class="report-header">
        <span>📱 PURCHASE FLOW DIAGNOSTIC REPORT: ${targetProvider.name.toUpperCase()}</span>
    </div>
    <div style="margin-bottom: 12px;">
        <span class="${purchaseSuccess ? 'tag-success' : 'tag-error'}" style="font-size:14px;padding:4px 10px;">
            ${purchaseSuccess ? (isDryRun ? '🟢 DRY_RUN VERIFIED (PASSED)' : '🟢 LIVE PURCHASE SUCCESSFUL') : '🔴 PURCHASE FAILED'}
        </span>
    </div>
    <table class="report-table">
        <thead>
            <tr>
                <th>Property</th>
                <th>Resolved Diagnostic Value</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Target Route</td>
                <td><b>${countryParam.toUpperCase()}</b> &rarr; <b>${serviceParam.toUpperCase()}</b> (${targetProvider.name})</td>
            </tr>
            <tr>
                <td>Upstream URL Template</td>
                <td><div class="payload-code">${lastUpstreamUrl || 'N/A'}</div></td>
            </tr>
            <tr>
                <td>Last Upstream Response / Log</td>
                <td><div class="payload-code">${lastRawResponse || (purchaseSuccess ? 'SUCCESS (200 OK)' : 'N/A')}</div></td>
            </tr>
            <tr>
                <td>Activated Number</td>
                <td><b>${successResult?.phoneNumber || 'N/A'}</b></td>
            </tr>
            <tr>
                <td>Activation ID</td>
                <td><code>${successResult?.activationId || 'N/A'}</code></td>
            </tr>
            <tr>
                <td>Total Candidates Evaluated</td>
                <td><b>${candidatesList.length}</b> candidates</td>
            </tr>
            <tr>
                <td>Total Flow Latency</td>
                <td><b>${totalDuration}ms</b></td>
            </tr>
        </tbody>
    </table>
</div>`
                        send(reportCardHtml)
                    } else {
                        send(`\n========================================================================================`)
                        send(`                 PURCHASE DIAGNOSTIC REPORT: ${targetProvider.name.toUpperCase()}`)
                        send(`========================================================================================`)
                        send(`Outcome: ${purchaseSuccess ? 'SUCCESS' : 'FAILED'}`)
                        send(`Upstream URL: ${lastUpstreamUrl}`)
                        send(`Activated Number: ${successResult?.phoneNumber || 'N/A'}`)
                        send(`Duration: ${totalDuration}ms`)
                        send(`========================================================================================\n`)
                    }
                } else {
                    // Smart Router Debug
                    send(`[STEP 3] SmartRouter Multi-Provider Evaluation...`)
                    const quotes = await smsProvider.getRankedProviders(countryParam, serviceParam)
                    send(`[SUCCESS] SmartRouter returned ${quotes.length} ranked provider quotes.`)
                    quotes.forEach((q: any, idx: number) => {
                        send(`   Quote #${idx + 1}: ${q.displayName || q.id} | sellPoints=${q.pointPrice} Pts | stock=${q.stock} | score=${q.rank}`)
                    })
                }

                send(`[SUCCESS] FULL PURCHASE DIAGNOSTIC TRACE COMPLETE IN ${Date.now() - startTime}ms.`)
                controller.close()
            } catch (error: any) {
                send(`[ERROR] FATAL ERROR DURING PURCHASE DIAGNOSTIC TRACE: ${error.stack || error.message || error}`)
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
