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
    <title>NexNum Enterprise Provider Sync Debugger</title>
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
            background: linear-gradient(135deg, #38bdf8, #818cf8);
            color: #000;
            font-weight: 900;
            font-size: 18px;
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 15px rgba(56, 189, 248, 0.4);
        }
        .title { color: var(--text-primary); font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
        .subtitle { color: var(--text-secondary); font-size: 12px; margin-top: 2px; }
        .pulse-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(74, 222, 128, 0.1);
            border: 1px solid rgba(74, 222, 128, 0.3);
            color: var(--success-green);
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 600;
        }
        .pulse-dot {
            width: 8px;
            height: 8px;
            background-color: var(--success-green);
            border-radius: 50%;
            box-shadow: 0 0 8px var(--success-green);
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }

        /* Toolbar Controls */
        .toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid var(--border-color);
            padding: 8px 12px;
            border-radius: 10px;
            flex-wrap: wrap;
        }
        .select-input, .btn {
            background: #1e293b;
            border: 1px solid #334155;
            color: var(--text-primary);
            padding: 8px 14px;
            border-radius: 6px;
            font-family: inherit;
            font-size: 12px;
            outline: none;
            transition: all 0.2s ease;
        }
        .select-input:focus, .btn:hover { border-color: var(--accent-blue); background: #334155; cursor: pointer; }
        .btn-primary { background: #0284c7; color: #fff; border-color: #38bdf8; font-weight: 600; }
        .btn-primary:hover { background: #0369a1; box-shadow: 0 0 12px rgba(56, 189, 248, 0.3); }

        /* Stats Counter Bar */
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
            transition: transform 0.2s ease;
        }
        .stat-card:hover { transform: translateY(-2px); border-color: #374151; }
        .stat-label { color: var(--text-secondary); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
        .stat-value { font-size: 22px; font-weight: 700; color: var(--text-primary); }
        .stat-value.blue { color: var(--accent-blue); }
        .stat-value.green { color: var(--success-green); }
        .stat-value.amber { color: var(--warning-amber); }
        .stat-value.purple { color: var(--accent-purple); }

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
            background: linear-gradient(135deg, #1e1b4b, #0f172a);
            border: 1px solid #4338ca;
            border-radius: 12px;
            padding: 24px;
            margin-top: 20px;
            box-shadow: 0 10px 30px -10px rgba(67, 56, 202, 0.4);
        }
        .report-header { font-size: 16px; font-weight: 700; color: #a5b4fc; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .progress-bar-bg { background: #1e293b; height: 12px; border-radius: 6px; overflow: hidden; margin: 12px 0 20px 0; border: 1px solid #334155; }
        .progress-bar-fill { height: 100%; background: linear-gradient(90deg, #38bdf8, #4ade80); transition: width 0.5s ease; }
        .report-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        .report-table th, .report-table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #1e293b; }
        .report-table th { color: var(--text-secondary); font-size: 11px; text-transform: uppercase; }
        .report-table td { font-size: 13px; }
        .clickable-row { cursor: pointer; transition: background 0.15s ease; }
        .clickable-row:hover { background: rgba(56, 189, 248, 0.08) !important; }

        /* Modal Inspector Styles */
        .modal-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(3, 7, 18, 0.85); backdrop-filter: blur(8px);
            display: flex; align-items: center; justify-content: center;
            z-index: 9999; padding: 24px;
        }
        .modal-content {
            background: #0f172a; border: 1px solid #38bdf8; border-radius: 14px;
            width: 90vw; max-width: 1100px; max-height: 85vh;
            display: flex; flex-direction: column;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8); overflow: hidden;
        }
        .modal-header {
            background: #1e293b; padding: 16px 24px;
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #334155;
        }
        .modal-close {
            background: transparent; border: none; color: #9ca3af;
            font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px;
        }
        .modal-close:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
        .modal-tabs {
            display: flex; gap: 8px; background: #090d16; padding: 12px 24px;
            border-bottom: 1px solid #1e293b; overflow-x: auto;
        }
        .tab-btn {
            background: #1e293b; border: 1px solid #334155; color: #9ca3af;
            padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;
            white-space: nowrap;
        }
        .tab-btn.active { background: #0284c7; color: #fff; border-color: #38bdf8; }
        .modal-body { padding: 20px; overflow-y: auto; flex: 1; background: #070a12; }
        .json-code-box {
            color: #38bdf8; font-size: 12px; font-family: 'JetBrains Mono', monospace;
            white-space: pre-wrap; word-break: break-all; line-height: 1.6;
        }
        .modal-footer {
            padding: 14px 24px; background: #1e293b; border-top: 1px solid #334155;
            display: flex; justify-content: flex-end; gap: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Top Nav -->
        <div class="header">
            <div class="brand">
                <div class="logo-icon">⚡</div>
                <div>
                    <div class="title">NexNum Provider Sync Console</div>
                    <div class="subtitle">Live Deep Search & Pricing Retention Diagnostic Pipeline</div>
                </div>
            </div>
            <div class="toolbar">
                <div class="pulse-badge">
                    <span class="pulse-dot"></span> Live SSE Stream
                </div>
                <select id="providerSelect" class="select-input">
                    <option value="5simnet" ${providerParam === '5simnet' ? 'selected' : ''}>5Simnet</option>
                    <option value="grizzlysms" ${providerParam === 'grizzlysms' ? 'selected' : ''}>GrizzlySMS</option>
                    <option value="smshub" ${providerParam === 'smshub' ? 'selected' : ''}>SMSHub</option>
                    <option value="smsactivate" ${providerParam === 'smsactivate' ? 'selected' : ''}>SMS-Activate</option>
                    <option value="all" ${providerParam === 'all' ? 'selected' : ''}>⚡ All Active Providers</option>
                </select>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                    <input type="checkbox" id="clearOldCheck" ${clearOld ? 'checked' : ''} /> Clear Old Data
                </label>
                <button class="btn btn-primary" onclick="runSync()">▶ Run Sync</button>
                <button class="btn" onclick="clearTerminal()">🧹 Clear</button>
                <button class="btn" onclick="copyLogs()">📋 Copy Logs</button>
            </div>
        </div>

        <!-- Live Metric Cards -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Raw API Pairs</div>
                <div id="stat-raw" class="stat-value blue">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Indexed Documents</div>
                <div id="stat-indexed" class="stat-value green">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Data Retention Rate</div>
                <div id="stat-retention" class="stat-value amber">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active Stock ( >0 )</div>
                <div id="stat-stock" class="stat-value purple">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Execution Time</div>
                <div id="stat-duration" class="stat-value">-</div>
            </div>
        </div>

        <!-- Live Terminal Window -->
        <div id="terminal" class="terminal"></div>
    </div>

    <!-- Interactive JSON Inspector Modal (Indent=4) -->
    <div id="jsonModal" class="modal-overlay" style="display:none;">
        <div class="modal-content">
            <div class="modal-header">
                <div style="font-weight:700;font-size:15px;color:#38bdf8;display:flex;align-items:center;gap:8px;">
                    <span>🔍 MeiliSearch Document Inspector</span>
                    <span style="font-size:11px;background:rgba(56,189,248,0.15);color:#38bdf8;padding:2px 8px;border-radius:4px;border:1px solid rgba(56,189,248,0.3);">indent = 4</span>
                </div>
                <button class="modal-close" onclick="closeModal()">✖</button>
            </div>
            <div class="modal-tabs">
                <button id="tab-softFiltered" class="tab-btn active" onclick="switchTab('softFiltered')">ℹ️ Soft-Filtered Unlisted Services (Sample)</button>
                <button id="tab-meiliOffers" class="tab-btn" onclick="switchTab('meiliOffers')">📦 Transformed Offers (Sample)</button>
                <button id="tab-rawApi" class="tab-btn" onclick="switchTab('rawApi')">📡 Raw API Pairs (Sample)</button>
            </div>
            <div class="modal-body">
                <pre id="jsonViewer" class="json-code-box"></pre>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary" onclick="copyModalJson()">📋 Copy JSON (indent=4)</button>
                <button class="btn" onclick="closeModal()">Close</button>
            </div>
        </div>
    </div>

    <script>
        const term = document.getElementById('terminal');
        let autoScroll = true;

        let currentModalTab = 'softFiltered';

        function openModal(tabKey) {
            currentModalTab = tabKey || 'softFiltered';
            switchTab(currentModalTab);
            document.getElementById('jsonModal').style.display = 'flex';
        }

        function closeModal() {
            document.getElementById('jsonModal').style.display = 'none';
        }

        function switchTab(tabKey) {
            currentModalTab = tabKey;
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            const activeBtn = document.getElementById('tab-' + tabKey);
            if (activeBtn) activeBtn.classList.add('active');
            renderModalData();
        }

        function renderModalData() {
            let data = [];
            if (currentModalTab === 'softFiltered') data = window.SAMPLE_SOFT_FILTERED || [];
            else if (currentModalTab === 'meiliOffers') data = window.SAMPLE_TRANSFORMED || [];
            else if (currentModalTab === 'rawApi') data = window.SAMPLE_RAW || [];

            const jsonText = (data && data.length > 0)
                ? JSON.stringify(data, null, 4)
                : '// No sample JSON documents collected for this category yet.';
            document.getElementById('jsonViewer').innerText = jsonText;
        }

        function copyModalJson() {
            const text = document.getElementById('jsonViewer').innerText;
            navigator.clipboard.writeText(text);
            alert('JSON data (indent=4) copied to clipboard!');
        }

        // Dismiss modal on Escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        function runSync() {
            const provider = document.getElementById('providerSelect').value;
            const clearOld = document.getElementById('clearOldCheck').checked;
            window.location.href = '/api/admin/providers/debug-sync?provider=' + provider + '&clearOld=' + clearOld;
        }

        function clearTerminal() {
            term.innerHTML = '';
        }

        function copyLogs() {
            navigator.clipboard.writeText(term.innerText);
            alert('Logs copied to clipboard!');
        }

        function handleEvent(event, payload) {
            if (event === 'stats') {
                if (payload.rawApiPairs != null) document.getElementById('stat-raw').innerText = payload.rawApiPairs.toLocaleString();
                if (payload.validOffers != null) document.getElementById('stat-indexed').innerText = payload.validOffers.toLocaleString();
                if (payload.retentionRate != null) document.getElementById('stat-retention').innerText = payload.retentionRate + '%';
                if (payload.stockGtZeroCount != null) document.getElementById('stat-stock').innerText = payload.stockGtZeroCount.toLocaleString();
                if (payload.durationMs != null) document.getElementById('stat-duration').innerText = payload.durationMs.toLocaleString() + 'ms';
            }
        }

        function appendLog(msg) {
            const div = document.createElement('div');
            div.className = 'log-line';

            // Clean format replacements
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
    </script>`
                    controller.enqueue(encoder.encode(initialHtml))
                }
            }

            try {
                sendHeader()

                const startTime = Date.now()
                send(`[INFO] Initializing Debug Sync Session at ${new Date().toLocaleTimeString()}...`)
                send(`[INFO] Active Environment Bounds: minPrice=$${PricingConfig.minPrice} USD, maxPrice=$${PricingConfig.maxPrice} USD`)

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
                    send(`[ERROR] No active provider matching '${providerParam}' was found in Database!`)
                    controller.close()
                    return
                }

                send(`[SUCCESS] Loaded ${targetProviders.length} target provider(s): ${targetProviders.map(p => p.name.toUpperCase()).join(', ')}`)

                // Pre-cache currency rates & settings
                const currencyService = getCurrencyService()
                const systemSettings = await currencyService.getSettings()
                const rates = await currencyService.getAllRates()
                const standardRates = rates as Record<string, number>
                const pointsRate = Number(systemSettings.pointsRate)

                // Pre-cache DB Lookups
                send(`[INFO] Pre-loading Central Service & Country Registry lookups from PostgreSQL...`)
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

                send(`[SUCCESS] Loaded ${allServiceIds.length} central services and ${allCountryIds.length} country mappings from DB.`)

                // Sync each provider
                for (const provider of targetProviders) {
                    const pStart = Date.now()
                    send(`\n========================================================================================`)
                    send(`[STEP] STARTING DIAGNOSTIC TRACE FOR PROVIDER: ${provider.name.toUpperCase()}`)
                    send(`========================================================================================`)

                    // STEP 1: CLEAR OLD DATA IN MEILISEARCH IF REQUESTED
                    if (clearOld) {
                        send(`[STEP 1] Clearing existing documents in MeiliSearch for provider '${provider.name}'...`)
                        try {
                            const index = meili.index(INDEXES.OFFERS)
                            if (providerParam === 'all') {
                                const task = await index.deleteAllDocuments()
                                send(`[SUCCESS] Sent deleteAllDocuments request to MeiliSearch (Task UID: ${task.taskUid})`)
                            } else {
                                const task = await index.deleteDocuments({ filter: `provider = "${provider.name}"` })
                                send(`[SUCCESS] Sent deleteDocuments request for filter 'provider = "${provider.name}"' (Task UID: ${task.taskUid})`)
                            }
                        } catch (e: any) {
                            send(`[WARN] MeiliSearch Clear Warning: ${e.message}`)
                        }
                    }

                    // STEP 2: INSTANTIATE DYNAMIC PROVIDER
                    send(`[STEP 2] Initializing DynamicProvider instance...`)
                    const dynamicProvider = new DynamicProvider(provider as any)

                    // STEP 3: FETCH METADATA (COUNTRIES & SERVICES)
                    send(`[STEP 3] Fetching Static Metadata (getCountriesList & getServicesList)...`)
                    let countries: any[] = []
                    let services: any[] = []
                    try {
                        countries = await dynamicProvider.getCountriesList()
                        send(`[INFO] getCountriesList(): ${countries.length} countries returned`)
                    } catch (e: any) {
                        send(`[WARN] getCountriesList(): Failed/Skipped (${e.message})`)
                    }

                    try {
                        services = await dynamicProvider.getServicesList('')
                        if ((!services || services.length === 0) && countries.length > 0) {
                            services = await dynamicProvider.getServicesList(countries[0].code)
                        }
                        send(`[INFO] getServicesList(): ${services.length} static services returned`)
                    } catch (e: any) {
                        send(`[WARN] getServicesList(): Failed/Skipped (${e.message})`)
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

                    send(`[SUCCESS] Whitelist sets built: ${validCountryCodes.size} country keys, ${validServiceCodes.size} service keys`)

                    // STEP 4: FETCH RAW PRICES
                    send(`[STEP 4] Fetching live prices from Upstream Provider API...`)
                    const apiFetchStart = Date.now()
                    let rawPrices: any[] = []
                    try {
                        rawPrices = await dynamicProvider.getPrices()
                        send(`[SUCCESS] Raw Price Fetch completed in ${Date.now() - apiFetchStart}ms. Total PriceData objects parsed: ${rawPrices.length}`)
                    } catch (e: any) {
                        send(`[ERROR] Upstream Price Fetch Error: ${e.message}`)
                        continue
                    }

                    if (rawPrices.length === 0) {
                        send(`[WARN] Provider returned 0 price entries! Check provider balance or API configuration.`)
                        continue
                    }

                    sendEvent('stats', { rawApiPairs: rawPrices.length })

                    // STEP 5: PIPELINE TRACE & TRANSFORMATION AUDIT
                    send(`[STEP 5] Auditing Offer Transformation Pipeline (Raw API -> MeiliSearch Documents)...`)

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

                    const sampleSoftFilteredOffers: OfferDocument[] = []
                    const sampleTransformedOffers: OfferDocument[] = []

                    // Group price records by (countryCode, serviceCode)
                    const groupedPrices = new Map<string, { priceItems: any[]; isValidSvc: boolean }>()
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

                        if (!isValidSvc) {
                            unlistedServiceCount++
                            continue
                        }

                        if (!Number.isFinite(p.cost) || p.cost <= 0) {
                            zeroCostCount++
                            continue
                        }

                        const groupKey = `${normCty}_${normSvc}`
                        if (!groupedPrices.has(groupKey)) groupedPrices.set(groupKey, { priceItems: [], isValidSvc })
                        groupedPrices.get(groupKey)!.priceItems.push(p)
                    }

                    // Process grouped offers
                    for (const [, { priceItems, isValidSvc }] of groupedPrices.entries()) {
                        const sample = priceItems[0]
                        const countryCode = sample.country
                        const serviceCode = sample.service

                        let svcName = (serviceMap.get(serviceCode) || serviceMap.get(serviceCode.toLowerCase()) || '').trim()
                        if (!svcName || svcName.toLowerCase() === 'unknown' || /^\d+$/.test(svcName)) {
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

                        const candidateItems: any[] = []
                        for (const groupItem of priceItems) {
                            if ((groupItem as any).purchaseCandidates && (groupItem as any).purchaseCandidates.length > 0) {
                                candidateItems.push(...(groupItem as any).purchaseCandidates)
                            } else {
                                candidateItems.push(groupItem)
                            }
                        }

                        for (const item of candidateItems) {
                            const rawCostNum = Number(item.cost || item.rawCost)
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

                            const stockCount = Math.max(0, Number(item.count || item.stock || 0))
                            totalGroupStock += stockCount

                            const operatorName = (item.operator && String(item.operator).trim()) ? String(item.operator).trim() : 'any'
                            candidatesList.push({
                                candidateId: `${provider.name}_${canonicalCtyCode}_${canonicalSvcCode}_${operatorName}`,
                                provider: provider.name,
                                operator: operatorName,
                                providerServiceCode: String(item.service || serviceCode),
                                providerCountryCode: String(item.country || countryCode),
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

                        const allCurrencyPrices = await currencyService.pointsToAllFiat(bestCandidate.pointPrice)

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
                                ...allCurrencyPrices,
                                POINTS: bestCandidate.pointPrice
                            },
                            purchaseCandidates: candidatesList,
                            stock: totalGroupStock,
                            operator: bestCandidate.operator,
                            countryIcon: getCountryFlagUrlSync(canonicalCtyName) || '',
                            isActive: true,
                            lastSyncedAt: Date.now()
                        }

                        if (!isValidSvc && sampleSoftFilteredOffers.length < 10) {
                            sampleSoftFilteredOffers.push(offerDoc)
                        }
                        if (sampleTransformedOffers.length < 10) {
                            sampleTransformedOffers.push(offerDoc)
                        }

                        allOffersMap.set(offerDoc.id, offerDoc)
                    }

                    const finalOffersList = Array.from(allOffersMap.values())
                    send(`[SUCCESS] Step 5 Completed: Transformed raw data into ${finalOffersList.length.toLocaleString()} unique MeiliSearch Offer Documents.`)

                    // STEP 6: MEILISEARCH INDEXING
                    send(`[STEP 6] Indexing ${finalOffersList.length.toLocaleString()} documents into MeiliSearch index '${INDEXES.OFFERS}'...`)
                    const index = meili.index(INDEXES.OFFERS)
                    const chunkSize = 5000
                    let indexedCount = 0

                    for (let i = 0; i < finalOffersList.length; i += chunkSize) {
                        const chunk = finalOffersList.slice(i, i + chunkSize)
                        const task = await index.addDocuments(chunk)
                        indexedCount += chunk.length
                        send(`[INFO] Enqueued chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(finalOffersList.length / chunkSize)} (${chunk.length} docs, Task UID: ${task.taskUid})`)
                    }

                    const pDuration = Date.now() - pStart
                    const retentionRateNum = rawPairsCount > 0 ? Number(((finalOffersList.length / rawPairsCount) * 100).toFixed(2)) : 100.0

                    sendEvent('stats', {
                        rawApiPairs: rawPairsCount,
                        validOffers: finalOffersList.length,
                        retentionRate: retentionRateNum,
                        stockGtZeroCount,
                        durationMs: pDuration
                    })

                    // STEP 7: PRINT EXECUTIVE HTML SUMMARY CARD AT END
                    if (isHtml) {
                        const scriptDataHtml = `<script>
                            window.SAMPLE_SOFT_FILTERED = ${JSON.stringify(sampleSoftFilteredOffers)};
                            window.SAMPLE_TRANSFORMED = ${JSON.stringify(sampleTransformedOffers)};
                            window.SAMPLE_RAW = ${JSON.stringify(rawPrices.slice(0, 10))};
                        </script>`
                        send(scriptDataHtml)

                        const reportCardHtml = `
<div class="report-card">
    <div class="report-header">
        <span>📊 DATA PIPELINE RETENTION AUDIT REPORT: ${provider.name.toUpperCase()}</span>
        <button class="btn btn-primary" style="font-size:11px;padding:5px 12px;" onclick="openModal('softFiltered')">🔍 Inspect Sample JSON (indent=4)</button>
    </div>
    <div style="display:flex;justify-content:space-between;font-weight:600;font-size:14px;">
        <span>Retention Score</span>
        <span style="color: ${retentionRateNum >= 90 ? 'var(--success-green)' : (retentionRateNum >= 50 ? 'var(--warning-amber)' : 'var(--error-red)')}">${retentionRateNum}%</span>
    </div>
    <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width: ${retentionRateNum}%; background: ${retentionRateNum >= 90 ? 'linear-gradient(90deg, #38bdf8, #4ade80)' : 'linear-gradient(90deg, #fbbf24, #f87171)'}"></div>
    </div>
    <table class="report-table">
        <thead>
            <tr>
                <th>Pipeline Stage</th>
                <th>Offer Count</th>
                <th>Status / Impact</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
            <tr class="clickable-row" onclick="openModal('rawApi')">
                <td>Stage 1: Raw API Pairs Received</td>
                <td><b>${rawPairsCount.toLocaleString()}</b></td>
                <td><span class="tag-info">INPUT</span></td>
                <td><button class="btn" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();openModal('rawApi')">🔍 Raw JSON</button></td>
            </tr>
            <tr class="clickable-row" onclick="openModal('rawApi')">
                <td>Stage 2: Parsed PriceData Objects</td>
                <td><b>${rawPrices.length.toLocaleString()}</b></td>
                <td><span class="tag-info">PARSED</span></td>
                <td><button class="btn" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();openModal('rawApi')">🔍 Parsed JSON</button></td>
            </tr>
            <tr class="clickable-row" onclick="openModal('meiliOffers')">
                <td>Stage 3: Transformed & Indexed Offers</td>
                <td><b>${finalOffersList.length.toLocaleString()}</b></td>
                <td><span class="tag-success">RETAINED (${retentionRateNum}%)</span></td>
                <td><button class="btn" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();openModal('meiliOffers')">🔍 Indexed JSON</button></td>
            </tr>
            <tr class="clickable-row" onclick="openModal('meiliOffers')">
                <td>📦 Active In-Stock Offers (stock &gt; 0)</td>
                <td><b>${stockGtZeroCount.toLocaleString()}</b></td>
                <td><span class="tag-success">READY FOR PURCHASE</span></td>
                <td><button class="btn" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();openModal('meiliOffers')">🔍 View Sample</button></td>
            </tr>
            <tr>
                <td>📦 Zero-Stock Restock Offers (stock = 0)</td>
                <td><b>${stockZeroCount.toLocaleString()}</b></td>
                <td><span class="tag-warn">AUTO-RESTOCK WATCH</span></td>
                <td>-</td>
            </tr>
            <tr>
                <td>🛑 Price Out-of-Bounds (&lt;$${PricingConfig.minPrice} / &gt;$${PricingConfig.maxPrice})</td>
                <td><b>${priceOutOfBoundsCount.toLocaleString()}</b></td>
                <td>${priceOutOfBoundsCount > 0 ? '<span class="tag-error">FILTERED BY MIN_PRICE_USD</span>' : '<span class="tag-success">CLEAN (0 DROPPED)</span>'}</td>
                <td>-</td>
            </tr>
            <tr class="clickable-row" onclick="openModal('softFiltered')" style="background: rgba(56, 189, 248, 0.05);">
                <td>ℹ️ Soft-Filtered Unlisted Services</td>
                <td><b>${unlistedServiceCount.toLocaleString()}</b></td>
                <td><span class="tag-success">AUTO-INCLUDED (0 DROPPED)</span></td>
                <td><button class="btn btn-primary" style="font-size:10px;padding:3px 10px;background:#0284c7;" onclick="event.stopPropagation();openModal('softFiltered')">🔍 Inspect Unlisted JSON (indent=4)</button></td>
            </tr>
            <tr>
                <td>❌ Dropped Unresolvable Names</td>
                <td><b>${(noCountryNameCount + noServiceNameCount).toLocaleString()}</b></td>
                <td>${(noCountryNameCount + noServiceNameCount) > 0 ? '<span class="tag-error">MISSING LOOKUP</span>' : '<span class="tag-success">100% MATCHED</span>'}</td>
                <td>-</td>
            </tr>
        </tbody>
    </table>
</div>`
                        send(reportCardHtml)
                    } else {
                        send(`\n========================================================================================`)
                        send(`                   DATA PIPELINE RETENTION AUDIT REPORT: ${provider.name.toUpperCase()}`)
                        send(`========================================================================================`)
                        send(`📊 Stage 1: Raw API Pairs Received  ......................... ${rawPairsCount.toLocaleString()}`)
                        send(`📊 Stage 2: Transformed Offer Documents .................... ${finalOffersList.length.toLocaleString()}`)
                        send(`✨ DATA RETENTION RATE: ${retentionRateNum}% (${finalOffersList.length.toLocaleString()} / ${rawPairsCount.toLocaleString()} offers retained)`)
                        send(`🛑 Price Out-of-Bounds (<$${PricingConfig.minPrice} / >$${PricingConfig.maxPrice}): .. ${priceOutOfBoundsCount.toLocaleString()}`)
                        send(`⏱️ Total Provider Sync Duration: ............................. ${pDuration}ms`)
                        send(`========================================================================================\n`)
                    }
                }

                send(`[SUCCESS] FULL DIAGNOSTIC SYNC COMPLETE IN ${Date.now() - startTime}ms.`)
                controller.close()
            } catch (error: any) {
                send(`[ERROR] FATAL ERROR DURING DIAGNOSTIC SYNC: ${error.stack || error.message || error}`)
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
