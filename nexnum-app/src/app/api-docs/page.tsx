'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
    Terminal,
    Key,
    Shield,
    Zap,
    Copy,
    Check,
    Search,
    Code2,
    Play,
    Server,
    ExternalLink,
    ChevronRight,
    AlertCircle,
    CheckCircle2,
    BookOpen,
    Layers,
    Globe,
    Cpu,
    ArrowRight,
    RefreshCw
} from 'lucide-react'

// Language Code Snippet Generators
const generateSnippets = (action: string, params: Record<string, string | undefined> = {}) => {
    const cleanParams: Record<string, string> = { action, api_key: 'YOUR_API_KEY' }
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) cleanParams[k] = String(v)
    })
    const queryStr = new URLSearchParams(cleanParams).toString()
    const baseUrl = 'https://nexnum.in/api/v1'
    const fullUrl = `${baseUrl}?${queryStr}`

    return {
        curl: `curl -X GET "${fullUrl}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Accept: application/json"`,

        javascript: `import { NexNum } from 'nexnum';

const client = new NexNum({ apiKey: 'YOUR_API_KEY' });

const response = await fetch('${fullUrl}', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Accept': 'application/json'
  }
});

const data = await response.json();
console.log(data);`,

        python: `import requests

url = "${fullUrl}"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Accept": "application/json"
}

response = requests.get(url, headers=headers)
print(response.text)`,

        go: `package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    req, _ := http.NewRequest("GET", "${fullUrl}", nil)
    req.Header.Add("Authorization", "Bearer YOUR_API_KEY")

    res, err := http.DefaultClient.Do(req)
    if err != nil {
        panic(err)
    }
    defer res.Body.Close()

    body, _ := io.ReadAll(res.Body)
    fmt.Println(string(body))
}`,

        php: `<?php
$ch = curl_init("${fullUrl}");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer YOUR_API_KEY',
    'Accept: application/json'
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;
?>`
    }
}

// Endpoints data definition
const ENDPOINTS = [
    {
        id: 'getBalance',
        action: 'getBalance',
        method: 'GET',
        name: 'Get Wallet Balance',
        category: 'Account & Billing',
        description: 'Retrieves current available wallet credit balance for the authenticated user API key in formatted currency units.',
        permission: 'read',
        params: [],
        responseFormat: 'text/plain',
        successResponse: 'ACCESS_BALANCE:25.50',
        errorResponses: [
            { code: 'BAD_KEY', desc: 'API key is missing, invalid, or lacks read permission.' }
        ],
        sampleParams: {}
    },
    {
        id: 'getNumber',
        action: 'getNumber',
        method: 'GET',
        name: 'Purchase Virtual Number',
        category: 'Number Management',
        description: 'Allocates a new virtual line from real SIM carrier inventory for a specific service and country.',
        permission: 'numbers',
        params: [
            { name: 'service', type: 'string | number', required: true, desc: 'Target service code (e.g. wa, tg, go) or numeric service ID.' },
            { name: 'country', type: 'string | number', required: true, desc: 'Target country code (e.g. in, us, uk) or numeric country ID.' },
            { name: 'operator', type: 'string | number', required: false, desc: 'Optional carrier operator filter code.' },
            { name: 'maxPrice', type: 'number', required: false, desc: 'Maximum acceptable price in points. Rejects offer if cost exceeds this cap.' }
        ],
        responseFormat: 'text/plain',
        successResponse: 'ACCESS_NUMBER:98472910:+919876543210',
        errorResponses: [
            { code: 'NO_NUMBERS', desc: 'No active carrier numbers available or price exceeds maxPrice cap.' },
            { code: 'NO_BALANCE', desc: 'Insufficient wallet credit balance.' },
            { code: 'BAD_SERVICE', desc: 'Invalid service or country code.' }
        ],
        sampleParams: { service: 'wa', country: 'in' }
    },
    {
        id: 'setStatus',
        action: 'setStatus',
        method: 'GET',
        name: 'Set Activation Status',
        category: 'Number Management',
        description: 'Updates activation line lifecycle state (mark ready, retry code, complete line, or cancel & refund).',
        permission: 'numbers',
        params: [
            { name: 'id', type: 'string', required: true, desc: 'Active activation ID returned during getNumber.' },
            { name: 'status', type: 'number', required: true, desc: 'Status code: 1 (Ready), 3 (Retry Code), 6/8 (Complete), -1 (Cancel & Refund).' }
        ],
        responseFormat: 'text/plain',
        successResponse: 'ACCESS_ACTIVATION',
        errorResponses: [
            { code: 'NO_ACTIVATION', desc: 'Activation ID not found or not owned by user.' },
            { code: 'BAD_STATUS', desc: 'Invalid status code specified.' }
        ],
        sampleParams: { id: '98472910', status: '6' }
    },
    {
        id: 'getStatus',
        action: 'getStatus',
        method: 'GET',
        name: 'Poll Received SMS & Code',
        category: 'SMS Messages',
        description: 'Polls real-time SMS inbox for an active line to inspect verification codes and delivery state.',
        permission: 'sms',
        params: [
            { name: 'id', type: 'string', required: true, desc: 'Target activation ID.' }
        ],
        responseFormat: 'application/json',
        successResponse: `{\n  "status": true,\n  "message": "STATUS_OK:847291"\n}`,
        errorResponses: [
            { code: 'STATUS_WAIT_CODE', desc: 'Waiting for inbound SMS code.' },
            { code: 'STATUS_TIMEOUT', desc: 'Number expired without receiving an SMS code.' },
            { code: 'STATUS_CANCEL', desc: 'Activation was cancelled.' }
        ],
        sampleParams: { id: '98472910' }
    },
    {
        id: 'getServicesList',
        action: 'getServicesList',
        method: 'GET',
        name: 'List Supported Services',
        category: 'Catalog & Coverage',
        description: 'Returns list of all 500+ supported services with numeric IDs, names, codes, and icon paths.',
        permission: 'read',
        params: [],
        responseFormat: 'application/json',
        successResponse: `{\n  "services": [\n    { "id": 1, "name": "WhatsApp", "code": "wa", "serviceIcon": "/assets/icons/services/wa.svg" },\n    { "id": 2, "name": "Telegram", "code": "tg", "serviceIcon": "/assets/icons/services/tg.svg" }\n  ]\n}`,
        errorResponses: [],
        sampleParams: {}
    },
    {
        id: 'getCountriesList',
        action: 'getCountriesList',
        method: 'GET',
        name: 'List Supported Countries',
        category: 'Catalog & Coverage',
        description: 'Returns list of all 180+ supported countries with numeric IDs, ISO codes, and flag icons.',
        permission: 'read',
        params: [],
        responseFormat: 'application/json',
        successResponse: `{\n  "countries": [\n    { "id": 1, "name": "India", "code": "in", "flagIcon": "/assets/icons/flags/in.svg" },\n    { "id": 2, "name": "United States", "code": "us", "flagIcon": "/assets/icons/flags/us.svg" }\n  ]\n}`,
        errorResponses: [],
        sampleParams: {}
    },
    {
        id: 'getPrices',
        action: 'getPrices',
        method: 'GET',
        name: 'Get Real-Time Price Matrix',
        category: 'Catalog & Coverage',
        description: 'Returns live carrier prices, available line counts, and provider breakdown grouped by country and service.',
        permission: 'read',
        params: [
            { name: 'country', type: 'string | number', required: false, desc: 'Filter matrix by specific country code or ID.' },
            { name: 'service', type: 'string | number', required: false, desc: 'Filter matrix by specific service code or ID.' }
        ],
        responseFormat: 'application/json',
        successResponse: `{\n  "1": {\n    "1": {\n      "price": 5.00,\n      "count": 1420,\n      "providers": {\n        "1000": { "count": 1420, "price": 5.00, "provider_id": "1000", "provider_name": "GrizzlySMS" }\n      }\n    }\n  }\n}`,
        errorResponses: [],
        sampleParams: { country: 'in', service: 'wa' }
    },
    {
        id: 'getNumbersStatus',
        action: 'getNumbersStatus',
        method: 'GET',
        name: 'Get Active User Lines',
        category: 'Number Management',
        description: 'Returns real-time status and message histories for all active numbers owned by the API key user.',
        permission: 'numbers',
        params: [],
        responseFormat: 'application/json',
        successResponse: `{\n  "98472910": {\n    "phone": "+919876543210",\n    "countryId": 1,\n    "countryName": "India",\n    "serviceName": "WhatsApp",\n    "status": "received",\n    "sms": [\n      { "sender": "WhatsApp", "code": "847291", "content": "Your code is 847291", "receivedAt": "2026-07-30T15:30:00Z" }\n    ]\n  }\n}`,
        errorResponses: [],
        sampleParams: {}
    },
    {
        id: 'getProviders',
        action: 'getProviders',
        method: 'GET',
        name: 'List Active Carrier Networks',
        category: 'Catalog & Coverage',
        description: 'Returns registry of active carrier networks and provider codes currently supplying SMS routes.',
        permission: 'read',
        params: [],
        responseFormat: 'application/json',
        successResponse: `{\n  "providers": [\n    { "id": "1000", "name": "GrizzlySMS" },\n    { "id": "1001", "name": "5sim" }\n  ]\n}`,
        errorResponses: [],
        sampleParams: {}
    }
]

export default function ApiDocsPage() {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedTab, setSelectedTab] = useState<Record<string, 'curl' | 'javascript' | 'python' | 'go' | 'php'>>({
        getBalance: 'curl',
        getNumber: 'curl',
        setStatus: 'curl',
        getStatus: 'curl',
        getServicesList: 'curl',
        getCountriesList: 'curl',
        getPrices: 'curl',
        getNumbersStatus: 'curl',
        getProviders: 'curl'
    })
    const [copiedId, setCopiedId] = useState<string | null>(null)

    // Interactive Playground State
    const [pgAction, setPgAction] = useState('getNumber')
    const [pgService, setPgService] = useState('wa')
    const [pgCountry, setPgCountry] = useState('in')
    const [pgApiKey, setPgApiKey] = useState('nx_live_98a72b10f...')
    const [pgLang, setPgLang] = useState<'curl' | 'javascript' | 'python' | 'go'>('curl')

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const filteredEndpoints = ENDPOINTS.filter(ep =>
        ep.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.description.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const constructPlaygroundUrl = () => {
        const params: Record<string, string> = { action: pgAction, api_key: pgApiKey }
        if (pgAction === 'getNumber') {
            params.service = pgService
            params.country = pgCountry
        } else if (pgAction === 'getStatus' || pgAction === 'setStatus') {
            params.id = '98472910'
            if (pgAction === 'setStatus') params.status = '6'
        } else if (pgAction === 'getPrices') {
            params.service = pgService
            params.country = pgCountry
        }
        return `https://nexnum.in/api/v1?${new URLSearchParams(params).toString()}`
    }

    return (
        <div className="min-h-screen bg-[#08080a] text-gray-100 font-sans selection:bg-[hsl(var(--neon-lime))] selection:text-black">

            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-50 bg-[#0a0a0d]/90 backdrop-blur-2xl border-b border-white/10 shadow-2xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/en" className="flex items-center gap-2.5 group">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--neon-lime))] to-[hsl(72,70%,40%)] p-1.5 flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] group-hover:scale-105 transition-transform">
                                <Image
                                    src="/assets/brand/nexnum-logo.svg"
                                    alt="NexNum Logo"
                                    width={24}
                                    height={24}
                                    className="text-black"
                                />
                            </div>
                            <span className="font-extrabold text-white text-lg tracking-tight">NexNum</span>
                        </Link>
                        <span className="h-4 w-[1px] bg-white/20 hidden sm:block" />
                        <div className="hidden sm:flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] border border-[hsl(var(--neon-lime)/0.3)]">
                                API v1.0.0
                            </span>
                            <span className="flex items-center text-[11px] font-medium text-emerald-400 gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Operational
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            href="/en/dashboard/settings"
                            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                        >
                            <Key className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" />
                            Get API Key
                        </Link>
                        <Link
                            href="/en/dashboard"
                            className="inline-flex items-center justify-center h-9 px-4 text-xs font-bold bg-[hsl(var(--neon-lime))] text-black rounded-xl hover:bg-[hsl(var(--neon-lime-soft))] transition-all shadow-md shadow-[hsl(var(--neon-lime)/0.2)]"
                        >
                            Dashboard <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Link>
                    </div>
                </div>
            </header>

            {/* HERO SECTION - Brand Aligned */}
            <section className="relative py-16 sm:py-24 border-b border-white/10 overflow-hidden bg-gradient-to-b from-[#0c0d12] via-[#08080a] to-[#08080a]">
                {/* Background Spotlights */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-[hsl(var(--neon-lime)/0.08)] blur-[140px] pointer-events-none rounded-full" />
                
                <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
                    <div className="grid lg:grid-cols-12 gap-12 items-center">
                        
                        {/* Hero Left Info */}
                        <div className="lg:col-span-7 text-left">
                            <div className="inline-flex items-center px-3.5 py-1 rounded-full border border-[hsl(var(--neon-lime)/0.4)] bg-[hsl(var(--neon-lime)/0.08)] backdrop-blur-sm mb-6 shadow-md shadow-[hsl(var(--neon-lime)/0.1)]">
                                <Code2 className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))] mr-2" />
                                <span className="text-xs font-semibold text-[hsl(var(--neon-lime))] tracking-wide uppercase">
                                    Developer Portal & Reference
                                </span>
                            </div>

                            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold text-white tracking-tight leading-[1.08] mb-6">
                                Build With The <br />
                                <span className="text-[hsl(var(--neon-lime))] neon-text-glow">NexNum API v1</span>
                            </h1>

                            <p className="text-base sm:text-lg text-gray-300 max-w-xl leading-relaxed mb-8">
                                Complete RESTful interface providing direct access to real-SIM carrier numbers, instant SMS OTP activations, 180+ country catalogs, and provider pricing matrices.
                            </p>

                            {/* Stats Highlights */}
                            <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
                                <div>
                                    <div className="text-xl sm:text-2xl font-bold text-white font-mono">&lt; 120ms</div>
                                    <div className="text-xs text-gray-400">Avg API Latency</div>
                                </div>
                                <div>
                                    <div className="text-xl sm:text-2xl font-bold text-[hsl(var(--neon-lime))] font-mono">180+</div>
                                    <div className="text-xs text-gray-400">Supported Nations</div>
                                </div>
                                <div>
                                    <div className="text-xl sm:text-2xl font-bold text-white font-mono">500+</div>
                                    <div className="text-xs text-gray-400">Active Services</div>
                                </div>
                            </div>
                        </div>

                        {/* Hero Right Interactive Snippet Card */}
                        <div className="lg:col-span-5">
                            <div className="rounded-3xl p-6 bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent border border-white/10 backdrop-blur-2xl shadow-2xl relative overflow-hidden group">
                                <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                                        <span className="text-xs font-mono text-gray-400 ml-2">Quickstart Example</span>
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(generateSnippets('getNumber', { service: 'wa', country: 'in' }).curl, 'hero-snippet')}
                                        className="text-xs text-gray-400 hover:text-[hsl(var(--neon-lime))] flex items-center gap-1 transition-colors"
                                    >
                                        {copiedId === 'hero-snippet' ? <Check className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copiedId === 'hero-snippet' ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>

                                <pre className="font-mono text-xs text-gray-300 leading-relaxed overflow-x-auto p-3 rounded-xl bg-black/50 border border-white/5">
                                    <code>{`// Purchase WhatsApp Number (India)
curl -X GET "https://nexnum.in/api/v1?action=getNumber&service=wa&country=in" \\
  -H "Authorization: Bearer YOUR_API_KEY"

// Output:
"ACCESS_NUMBER:98472910:+919876543210"`}</code>
                                </pre>

                                <div className="mt-4 flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-white/5">
                                    <span className="flex items-center gap-1.5 text-emerald-400">
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Direct Carrier Route
                                    </span>
                                    <span className="font-mono text-[11px] text-gray-500">20-Min Expiration</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            {/* MAIN CONTENT LAYOUT WITH SIDEBAR */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
                <div className="grid lg:grid-cols-12 gap-8">

                    {/* SIDEBAR NAVIGATION */}
                    <aside className="lg:col-span-3 space-y-6">
                        <div className="sticky top-24 rounded-2xl p-5 bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-xl space-y-6">
                            
                            {/* Search Filter */}
                            <div className="relative">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Filter endpoints..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-black/40 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-[hsl(var(--neon-lime)/0.5)] transition-all"
                                />
                            </div>

                            {/* Nav Sections */}
                            <nav className="space-y-4">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-2">
                                        Getting Started
                                    </div>
                                    <div className="space-y-1">
                                        <a href="#quickstart" className="block px-2.5 py-1.5 text-xs text-gray-300 hover:text-[hsl(var(--neon-lime))] hover:bg-white/5 rounded-lg transition-all">
                                            Quickstart & Base URL
                                        </a>
                                        <a href="#authentication" className="block px-2.5 py-1.5 text-xs text-gray-300 hover:text-[hsl(var(--neon-lime))] hover:bg-white/5 rounded-lg transition-all">
                                            Authentication & Keys
                                        </a>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-2">
                                        V1 API Actions
                                    </div>
                                    <div className="space-y-1">
                                        {filteredEndpoints.map(ep => (
                                            <a
                                                key={ep.id}
                                                href={`#${ep.id}`}
                                                className="flex items-center justify-between px-2.5 py-1.5 text-xs text-gray-300 hover:text-[hsl(var(--neon-lime))] hover:bg-white/5 rounded-lg transition-all group"
                                            >
                                                <span className="truncate">{ep.name}</span>
                                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 group-hover:bg-[hsl(var(--neon-lime)/0.2)] text-gray-400 group-hover:text-[hsl(var(--neon-lime))]">
                                                    {ep.action}
                                                </span>
                                            </a>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-2">
                                        Tools & Reference
                                    </div>
                                    <div className="space-y-1">
                                        <a href="#playground" className="block px-2.5 py-1.5 text-xs text-gray-300 hover:text-[hsl(var(--neon-lime))] hover:bg-white/5 rounded-lg transition-all">
                                            Interactive Playground
                                        </a>
                                        <a href="#error-codes" className="block px-2.5 py-1.5 text-xs text-gray-300 hover:text-[hsl(var(--neon-lime))] hover:bg-white/5 rounded-lg transition-all">
                                            Error Codes Guide
                                        </a>
                                    </div>
                                </div>
                            </nav>

                        </div>
                    </aside>

                    {/* MAIN DOCUMENTATION CONTENT */}
                    <main className="lg:col-span-9 space-y-16">

                        {/* QUICKSTART SECTION */}
                        <section id="quickstart" className="rounded-3xl p-8 bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-xl space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[hsl(var(--neon-lime)/0.15)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center text-[hsl(var(--neon-lime))]">
                                    <Zap className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-extrabold text-white">Quickstart & Base Endpoint</h2>
                                    <p className="text-xs text-gray-400">Wire protocol and global API parameters</p>
                                </div>
                            </div>

                            <p className="text-sm text-gray-300 leading-relaxed">
                                The NexNum Public API v1 implements a high-throughput, provider-compatible wire protocol. All requests originate from the primary base URL:
                            </p>

                            <div className="p-4 rounded-xl bg-black/60 border border-white/10 font-mono text-sm text-[hsl(var(--neon-lime))] flex items-center justify-between">
                                <span>https://nexnum.in/api/v1</span>
                                <button
                                    onClick={() => copyToClipboard('https://nexnum.in/api/v1', 'base-url')}
                                    className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                                >
                                    {copiedId === 'base-url' ? <Check className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copiedId === 'base-url' ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4 text-xs text-gray-300">
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                    <span className="font-bold text-white block mb-1">Plain Text Output (`text/plain`)</span>
                                    <p className="text-gray-400">Used for single line responses like `ACCESS_NUMBER` and `ACCESS_BALANCE` for direct legacy compatibility.</p>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                    <span className="font-bold text-white block mb-1">JSON Output (`application/json`)</span>
                                    <p className="text-gray-400">Used for structured catalog lookups (`getPrices`, `getServicesList`, `getCountriesList`).</p>
                                </div>
                            </div>
                        </section>

                        {/* AUTHENTICATION SECTION */}
                        <section id="authentication" className="rounded-3xl p-8 bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-xl space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                                    <Key className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-extrabold text-white">Authentication & API Keys</h2>
                                    <p className="text-xs text-gray-400">Securing your requests with Bearer Tokens</p>
                                </div>
                            </div>

                            <p className="text-sm text-gray-300 leading-relaxed">
                                Authenticate your requests using an API Key generated from your NexNum User Dashboard. You can provide your key in two ways:
                            </p>

                            <div className="space-y-3 font-mono text-xs">
                                <div className="p-3 rounded-xl bg-black/50 border border-white/10 text-gray-300">
                                    <span className="text-purple-400 font-bold block mb-1">Method 1: Authorization Header (Recommended)</span>
                                    Authorization: Bearer nx_live_98a72b10f...
                                </div>
                                <div className="p-3 rounded-xl bg-black/50 border border-white/10 text-gray-300">
                                    <span className="text-purple-400 font-bold block mb-1">Method 2: Query Parameter</span>
                                    GET https://nexnum.in/api/v1?action=getBalance&api_key=nx_live_98a72b10f...
                                </div>
                            </div>
                        </section>

                        {/* ENDPOINTS REFERENCE LIST */}
                        <div className="space-y-12">
                            <div className="border-b border-white/10 pb-4">
                                <h2 className="text-3xl font-extrabold text-white">API Action References</h2>
                                <p className="text-xs text-gray-400 mt-1">Detailed documentation for all 9 v1 provider actions</p>
                            </div>

                            {filteredEndpoints.map(ep => (
                                <section
                                    key={ep.id}
                                    id={ep.id}
                                    className="rounded-3xl p-8 bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-xl space-y-6 hover:border-white/20 transition-all"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="px-3 py-1 rounded-lg bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] border border-[hsl(var(--neon-lime)/0.3)] font-mono text-xs font-bold">
                                                    {ep.method}
                                                </span>
                                                <h3 className="text-xl font-bold text-white">{ep.name}</h3>
                                            </div>
                                            <p className="text-xs text-gray-400">{ep.description}</p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300">
                                                action={ep.action}
                                            </span>
                                            <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                                scope: {ep.permission}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Parameters Table */}
                                    {ep.params.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Request Parameters</h4>
                                            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
                                                <table className="w-full text-left text-xs">
                                                    <thead>
                                                        <tr className="border-b border-white/10 bg-white/5 text-gray-300">
                                                            <th className="p-3">Parameter</th>
                                                            <th className="p-3">Type</th>
                                                            <th className="p-3">Required</th>
                                                            <th className="p-3">Description</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5 text-gray-300 font-mono">
                                                        {ep.params.map(p => (
                                                            <tr key={p.name} className="hover:bg-white/[0.02]">
                                                                <td className="p-3 text-[hsl(var(--neon-lime))] font-bold">{p.name}</td>
                                                                <td className="p-3 text-purple-400">{p.type}</td>
                                                                <td className="p-3 font-sans">
                                                                    {p.required ? (
                                                                        <span className="text-amber-400 font-semibold">Yes</span>
                                                                    ) : (
                                                                        <span className="text-gray-500">Optional</span>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 font-sans text-gray-400">{p.desc}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Code Example Tabs */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Code Examples</h4>
                                            <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-white/10 text-xs">
                                                {(['curl', 'javascript', 'python', 'go', 'php'] as const).map(lang => (
                                                    <button
                                                        key={lang}
                                                        onClick={() => setSelectedTab(prev => ({ ...prev, [ep.id]: lang }))}
                                                        className={`px-3 py-1 rounded-lg font-mono text-xs transition-all ${
                                                            (selectedTab[ep.id] || 'curl') === lang
                                                                ? 'bg-[hsl(var(--neon-lime))] text-black font-bold'
                                                                : 'text-gray-400 hover:text-white'
                                                        }`}
                                                    >
                                                        {lang}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="relative rounded-2xl bg-black/60 border border-white/10 p-4 font-mono text-xs overflow-x-auto text-gray-300">
                                            <button
                                                onClick={() => copyToClipboard(generateSnippets(ep.action, ep.sampleParams)[selectedTab[ep.id] || 'curl'], ep.id)}
                                                className="absolute top-3 right-3 text-xs text-gray-400 hover:text-[hsl(var(--neon-lime))] flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg transition-colors border border-white/10"
                                            >
                                                {copiedId === ep.id ? <Check className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" /> : <Copy className="w-3.5 h-3.5" />}
                                                {copiedId === ep.id ? 'Copied' : 'Copy'}
                                            </button>
                                            <pre>
                                                <code>{generateSnippets(ep.action, ep.sampleParams)[selectedTab[ep.id] || 'curl']}</code>
                                            </pre>
                                        </div>
                                    </div>

                                    {/* Response Preview */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Response Sample ({ep.responseFormat})</h4>
                                        <div className="rounded-2xl bg-black/80 border border-white/10 p-4 font-mono text-xs text-emerald-400">
                                            <pre>
                                                <code>{ep.successResponse}</code>
                                            </pre>
                                        </div>
                                    </div>
                                </section>
                            ))}
                        </div>

                        {/* INTERACTIVE PLAYGROUND SECTION */}
                        <section id="playground" className="rounded-3xl p-8 bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-[hsl(var(--neon-lime)/0.05)] border border-[hsl(var(--neon-lime)/0.3)] backdrop-blur-xl shadow-2xl space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[hsl(var(--neon-lime)/0.15)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center text-[hsl(var(--neon-lime))]">
                                    <Play className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-extrabold text-white">Interactive API Playground</h2>
                                    <p className="text-xs text-gray-400">Test parameters and generate custom requests</p>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-300 block mb-1.5">Action</label>
                                    <select
                                        value={pgAction}
                                        onChange={(e) => setPgAction(e.target.value)}
                                        className="w-full px-3 py-2 text-xs rounded-xl bg-black/60 border border-white/10 text-white focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                    >
                                        {ENDPOINTS.map(ep => (
                                            <option key={ep.action} value={ep.action}>{ep.name} ({ep.action})</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-300 block mb-1.5">Service Code</label>
                                    <input
                                        type="text"
                                        value={pgService}
                                        onChange={(e) => setPgService(e.target.value)}
                                        placeholder="e.g. wa, tg, go"
                                        className="w-full px-3 py-2 text-xs rounded-xl bg-black/60 border border-white/10 text-white focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-300 block mb-1.5">Country Code</label>
                                    <input
                                        type="text"
                                        value={pgCountry}
                                        onChange={(e) => setPgCountry(e.target.value)}
                                        placeholder="e.g. in, us, uk"
                                        className="w-full px-3 py-2 text-xs rounded-xl bg-black/60 border border-white/10 text-white focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-300 block">Constructed Target URL</label>
                                <div className="p-3.5 rounded-xl bg-black/80 border border-white/10 font-mono text-xs text-[hsl(var(--neon-lime))] break-all flex items-center justify-between">
                                    <span>{constructPlaygroundUrl()}</span>
                                    <button
                                        onClick={() => copyToClipboard(constructPlaygroundUrl(), 'pg-url')}
                                        className="text-xs text-gray-400 hover:text-white flex items-center gap-1 shrink-0 ml-2"
                                    >
                                        {copiedId === 'pg-url' ? <Check className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* ERROR CODES GUIDE */}
                        <section id="error-codes" className="rounded-3xl p-8 bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-xl space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                                    <AlertCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-extrabold text-white">Error Codes Reference</h2>
                                    <p className="text-xs text-gray-400">Standard API error messages & resolution steps</p>
                                </div>
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-white/10 bg-white/5 text-gray-300">
                                            <th className="p-3">Error Code</th>
                                            <th className="p-3">HTTP</th>
                                            <th className="p-3">Description & Resolution</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-gray-300 font-mono">
                                        <tr>
                                            <td className="p-3 text-red-400 font-bold">NO_KEY</td>
                                            <td className="p-3">200 / 401</td>
                                            <td className="p-3 font-sans text-gray-400">API key was not supplied in header or query string.</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-red-400 font-bold">BAD_KEY</td>
                                            <td className="p-3">200 / 403</td>
                                            <td className="p-3 font-sans text-gray-400">API key is invalid, disabled, or lacks required permission scope.</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-amber-400 font-bold">BAD_SERVICE</td>
                                            <td className="p-3">200</td>
                                            <td className="p-3 font-sans text-gray-400">Invalid service or country code supplied during getNumber.</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-amber-400 font-bold">NO_NUMBERS</td>
                                            <td className="p-3">200</td>
                                            <td className="p-3 font-sans text-gray-400">No available carrier lines matching filter or price exceeds maxPrice cap.</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-amber-400 font-bold">NO_BALANCE</td>
                                            <td className="p-3">200</td>
                                            <td className="p-3 font-sans text-gray-400">Insufficient wallet credit balance to complete purchase.</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-red-400 font-bold">NO_ACTIVATION</td>
                                            <td className="p-3">200</td>
                                            <td className="p-3 font-sans text-gray-400">Activation ID not found or not owned by user API key.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                    </main>
                </div>
            </div>

            {/* FOOTER CALL TO ACTION */}
            <footer className="border-t border-white/10 bg-[#060608] py-12">
                <div className="max-w-7xl mx-auto px-4 text-center space-y-4">
                    <div className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[hsl(var(--neon-lime))] animate-pulse" />
                        <span className="text-xs text-gray-400">NexNum API v1.0.0 • Production Ready</span>
                    </div>
                    <p className="text-xs text-gray-500">
                        Need higher rate limits or enterprise dedicated pools? Contact developer support at <a href="mailto:support@nexnum.in" className="text-[hsl(var(--neon-lime))] hover:underline">support@nexnum.in</a>
                    </p>
                </div>
            </footer>

        </div>
    )
}
