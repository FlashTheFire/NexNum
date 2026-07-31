import React, { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Globe, Search, Plus, Trash2, Zap } from "lucide-react"

// --- Types & Constants ---
// API Standardization v2.0 - Universal Method Naming Convention

/**
 * Standardized API Methods
 * - get*List: Retrieve collections (countries, services)
 * - get*: Retrieve single items or status
 * - set*: Perform actions that change state
 */
export const ENDPOINT_METHODS = [
    'getBalance',
    'getCountriesList',
    'getServicesList',
    'getPrices',
    'getNumber',
    'getStatus',
    'getFullSmsText',
    'setResendCode',
    'setCancel',
    'setComplete'
] as const

export type EndpointMethod = typeof ENDPOINT_METHODS[number]

/**
 * Method Parameters
 * - Required: authKey (all), country/service (context-dependent)
 * - Optional: maxPrice, providerIds, exceptProviderIds, operator
 */
export const METHOD_PARAMS: Record<EndpointMethod, string[]> = {
    getBalance: ['{authKey}'],
    getCountriesList: ['{service}', '{authKey}'],          // service: optional filter
    getServicesList: ['{country}', '{authKey}'],           // country: optional filter
    getPrices: ['{country}', '{service}', '{authKey}'],
    getNumber: ['{country}', '{service}', '{maxPrice}', '{providerIds}', '{exceptProviderIds}', '{operator}', '{authKey}'],
    getStatus: ['{id}', '{authKey}'],
    getFullSmsText: ['{id}', '{authKey}'],
    setResendCode: ['{id}', '{authKey}'],
    setCancel: ['{id}', '{authKey}'],
    setComplete: ['{id}', '{authKey}']
}

/**
 * Universal Field Mappings
 * These are the ONLY field names allowed in NexNum output
 */
export const MAPPING_FIELDS: Record<EndpointMethod, string[]> = {
    getBalance: ['balance'],
    getCountriesList: ['name', 'code'],
    getServicesList: ['name', 'code'],
    getPrices: ['cost', 'count', 'country', 'service', 'operator'],
    getNumber: ['id', 'phone', 'price', 'country', 'service', 'operator'],
    getStatus: ['status', 'code'],
    getFullSmsText: ['code', 'text', 'dateTime', 'status'],
    setResendCode: ['status'],
    setCancel: ['status'],
    setComplete: ['status']
}

/**
 * Universal Field Names - Canonical Reference
 * NO OTHER FIELD NAMES ARE ALLOWED IN OUTPUT
 */
export const UNIVERSAL_FIELDS = {
    // Account
    balance: 'balance',
    // Inventory
    name: 'name',
    code: 'code',
    // Pricing
    cost: 'cost',
    count: 'count',
    country: 'country',
    service: 'service',
    operator: 'operator',
    // Purchase
    id: 'id',
    phone: 'phone',
    price: 'price',
    // Status
    status: 'status'
} as const

export type UniversalFieldName = keyof typeof UNIVERSAL_FIELDS


export function safeParse(jsonString: string) {
    try {
        return JSON.parse(jsonString)
    } catch (e) {
        return {}
    }
}

import PROVIDER_TEMPLATES_JSON from "@/config/templates/providers.json"

export const PROVIDER_TEMPLATES = PROVIDER_TEMPLATES_JSON

// --- Components ---

export function VariableHelper({ onInsert, context = 'endpoint' }: { onInsert: (v: string) => void, context?: 'endpoint' | 'mapping' }) {
    const variables = context === 'endpoint' ? [
        { label: 'Auth Key', value: '{authKey}', desc: 'API Key/Token from step 3' },
        { label: 'Country', value: '{country}', desc: 'Selected country code' },
        { label: 'Service', value: '{service}', desc: 'Selected service code' },
        { label: 'Activation ID', value: '{id}', desc: 'Transaction ID' },
        { label: 'Max Price', value: '{maxPrice}', desc: 'Maximum price filter' },
        { label: 'Operator', value: '{operator}', desc: 'Network operator' },
    ] : [
        { label: 'Root Object', value: '$', desc: 'JSON Root' },
        { label: 'Current Key', value: '$key', desc: 'Current level key' },
        { label: 'Parent Key', value: '$parentKey', desc: 'Parent level key' },
        { label: 'Grand Parent', value: '$grandParentKey', desc: 'Grandparent level key' },
        { label: 'At Depth', value: '$atDepth:0', desc: 'Key at specific depth' },
        { label: 'First Value', value: '$firstValue', desc: 'First Object Value' },
        { label: 'Default', value: '$default:', desc: 'Fallback if null/undefined' },
    ]

    return (
        <div className="space-y-2 md:space-y-3 p-3 md:p-4 bg-white/5 border border-white/5 rounded-xl">
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[9px] md:text-[10px] uppercase font-bold text-white/40 tracking-widest">Available Variables</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
                {variables.map(v => (
                    <button
                        key={v.value}
                        onClick={() => onInsert(v.value)}
                        className="group flex flex-col items-start gap-0.5 p-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left"
                    >
                        <code className="text-[10px] text-blue-300 bg-blue-500/10 px-1 py-0.5 rounded border border-blue-500/20 group-hover:bg-blue-500/20">{v.value}</code>
                        <span className="text-[9px] text-white/30">{v.desc}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

export function EndpointEditor({ endpoints, onChange }: { endpoints: any, onChange: (e: any) => void }) {
    const [activeMethod, setActiveMethod] = useState<EndpointMethod>('getBalance')

    const setEndpoint = (updates: any) => {
        onChange({
            ...endpoints,
            [activeMethod]: {
                ...(endpoints[activeMethod] || { method: 'GET', path: '' }),
                ...updates
            }
        })
    }

    const currentendpoint = endpoints[activeMethod] || { method: 'GET', path: '' }

    return (
        <div className="space-y-2 md:space-y-3">
            {/* Method Tabs - Scrollable on mobile */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                {ENDPOINT_METHODS.map(method => (
                    <button
                        key={method}
                        onClick={() => setActiveMethod(method)}
                        className={`text-[10px] md:text-xs px-2 md:px-3 py-1 md:py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 ${activeMethod === method ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                        {method.replace('get', '').replace('cancel', 'Cancel ')}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {/* Method + Path - Stack on mobile */}
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="w-full md:w-24 space-y-1.5">
                        <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Method</label>
                        <select
                            title="HTTP Method"
                            className="w-full h-9 px-3 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all cursor-pointer"
                            value={currentendpoint.method || 'GET'}
                            onChange={e => setEndpoint({ method: e.target.value })}
                        >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>
                    </div>
                    <div className="flex-1 space-y-1.5">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">API Path / URL</label>
                            {(currentendpoint.path?.startsWith('http') && currentendpoint.path?.includes('api_key=')) && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                                    <span className="text-[9px] font-bold text-indigo-400 uppercase">Compat</span>
                                </div>
                            )}
                            {(currentendpoint.path?.startsWith('http://') || currentendpoint.path?.startsWith('https://')) && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/20">
                                    <div className="w-1 h-1 rounded-full bg-yellow-400 animate-pulse" />
                                    <span className="text-[9px] font-bold text-yellow-400 uppercase">Hybrid Mode</span>
                                </div>
                            )}
                        </div>
                        <div className="relative group">
                            <Input
                                value={currentendpoint.path || ''}
                                onChange={e => setEndpoint({ path: e.target.value })}
                                placeholder="/v1/user/... OR https://..."
                                className={`bg-black/40 border-white/10 font-mono text-xs h-9 pr-8 transition-all focus:bg-black/60 ${(currentendpoint.path?.startsWith('http://') || currentendpoint.path?.startsWith('https://')) ? 'border-yellow-400/30 text-yellow-100' : ''}`}
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">
                                <Globe className="w-3.5 h-3.5 text-white/50" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Param Helpers - Smaller on mobile */}
                {METHOD_PARAMS[activeMethod as keyof typeof METHOD_PARAMS]?.length > 0 && (
                    <div className="p-2 bg-blue-500/5 rounded-lg border border-blue-500/10">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-bold text-blue-400/60 uppercase tracking-widest pl-1">Insert Params:</span>
                            {METHOD_PARAMS[activeMethod as keyof typeof METHOD_PARAMS].map(param => (
                                <button
                                    key={param}
                                    type="button"
                                    onClick={() => setEndpoint({ path: (currentendpoint.path || '') + param })}
                                    className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[10px] text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/30 transition-all font-mono"
                                >
                                    {param}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export function MappingEditor({ mappings, onChange }: { mappings: any, onChange: (m: any) => void }) {
    const [activeMethod, setActiveMethod] = useState<EndpointMethod>('getCountriesList')

    const setMapping = (updates: any) => {
        onChange({
            ...mappings,
            [activeMethod]: {
                ...(mappings[activeMethod] || {}),
                ...updates
            }
        })
    }

    const currentMapping = mappings[activeMethod] || {}

    return (
        <div className="space-y-3">
            {/* Method Tabs - Scrollable */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                {Object.keys(MAPPING_FIELDS).map(method => (
                    <button
                        key={method}
                        onClick={() => setActiveMethod(method as EndpointMethod)}
                        className={`text-[10px] md:text-xs px-2 md:px-3 py-1 md:py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 ${activeMethod === method ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                        {method.replace('get', '').replace('cancel', 'Cancel ')}
                    </button>
                ))}
            </div>

            {/* Type + Root - Stack on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Response Format</label>
                    <select
                        title="Response Format"
                        className="w-full h-9 px-3 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all cursor-pointer"
                        value={currentMapping.type || 'json_object'}
                        onChange={e => setMapping({ type: e.target.value })}
                    >
                        <option value="json_dictionary">Dictionary (Key-Value)</option>
                        <option value="json_array">Array (List)</option>
                        <option value="json_object">Standard Object</option>
                        <option value="text_regex">Text (Regex Match)</option>
                        <option value="text_lines">Text (Line Split)</option>
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Root Search Path</label>
                    <div className="relative group">
                        <Input
                            placeholder="e.g. data.items"
                            value={currentMapping.rootPath || ''}
                            onChange={e => setMapping({ rootPath: e.target.value })}
                            className="bg-black/40 border-white/10 text-xs h-9 pr-8 focus:bg-black/60 transition-all font-mono"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 transition-opacity">
                            <Search className="w-3.5 h-3.5 text-white/50" />
                        </div>
                    </div>
                </div>
            </div>

            {currentMapping.type === 'text_regex' && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Extraction Pattern (Regex)</label>
                    <div className="relative">
                        <Input
                            placeholder="e.g. ID:(\d+)"
                            value={currentMapping.regex || ''}
                            onChange={e => setMapping({ regex: e.target.value })}
                            className="bg-black/40 border-purple-500/30 font-mono text-xs h-9 text-purple-100"
                        />
                        <p className="mt-1 text-[9px] text-white/30 italic">Use (brackets) for capture groups. First group is $1, etc.</p>
                    </div>
                </div>
            )}

            {/* Field Map - Compact scrollable table */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] md:text-xs font-semibold text-white/50 uppercase tracking-wider">Field Extractors</label>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                            <div className="w-1 h-1 rounded-full bg-purple-400" />
                            <span className="text-[9px] text-white/50">Dot notation supported</span>
                        </div>
                    </div>
                </div>

                <div className="relative bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                    <div className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        <table className="w-full text-left text-[11px] md:text-xs border-collapse">
                            <thead className="sticky top-0 z-10 bg-white/5 backdrop-blur-md shadow-sm">
                                <tr>
                                    <th className="p-2 md:p-2.5 font-bold text-white/40 border-b border-white/10 w-24 md:w-32">EXPECTED FIELD</th>
                                    <th className="p-2 md:p-2.5 font-bold text-white/40 border-b border-white/10">PATH / KEY / REGEX GROUP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {MAPPING_FIELDS[activeMethod as keyof typeof MAPPING_FIELDS].map((field: string) => (
                                    <tr key={field} className="group hover:bg-white/5 transition-colors">
                                        <td className="p-2 md:p-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-3 rounded-full bg-purple-500/30 group-hover:bg-purple-500 transition-colors" />
                                                <code className="text-white font-medium text-[10px] md:text-[11px]">{field}</code>
                                            </div>
                                        </td>
                                        <td className="p-2 md:p-2.5">
                                            <input
                                                className="w-full bg-transparent border-none text-white text-[10px] md:text-[11px] focus:outline-none focus:ring-0 placeholder-white/20 font-mono"
                                                placeholder={`path for ${field}...`}
                                                value={currentMapping.fields?.[field] || ''}
                                                onChange={e => setMapping({
                                                    fields: { ...currentMapping.fields, [field]: e.target.value }
                                                })}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Conditional Fields Editor */}
            <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <label className="text-[10px] md:text-xs font-semibold text-white/70 uppercase tracking-wider">Conditional Response & Error Rules</label>
                    </div>
                    <span className="text-[9px] text-amber-400/80 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full font-mono">
                        Universal Rule Engine
                    </span>
                </div>

                <div className="bg-black/30 rounded-xl border border-white/10 p-3 space-y-3">
                    <p className="text-[10px] text-white/50">
                        Map raw provider responses or error codes (e.g. <code className="text-amber-300">NO_NUMBERS</code>, <code className="text-amber-300">STATUS_OK</code>, <code className="text-amber-300">sms.code</code>) to internal status and error messages.
                    </p>

                    {/* Existing Conditional Rules */}
                    {Object.entries(currentMapping.conditionalFields || {}).length > 0 ? (
                        <div className="space-y-2">
                            {Object.entries(currentMapping.conditionalFields || {}).map(([triggerKey, ruleObj]: [string, any]) => (
                                <div key={triggerKey} className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-white/5 p-2 rounded-lg border border-white/5 font-mono text-xs">
                                    <div className="flex-1 min-w-[120px]">
                                        <span className="text-[9px] text-white/40 block">TRIGGER KEY / CODE</span>
                                        <span className="text-amber-300 font-bold">{triggerKey}</span>
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                        <span className="text-[9px] text-white/40 block">MAP STATUS</span>
                                        <span className="text-emerald-400">{ruleObj?.status || 'N/A'}</span>
                                    </div>
                                    <div className="flex-2 min-w-[160px]">
                                        <span className="text-[9px] text-white/40 block">ERROR MESSAGE</span>
                                        <span className="text-rose-300">{ruleObj?.error || '-'}</span>
                                    </div>
                                    <button
                                        type="button"
                                        title="Remove rule"
                                        onClick={() => {
                                            const updated = { ...(currentMapping.conditionalFields || {}) }
                                            delete updated[triggerKey]
                                            setMapping({ conditionalFields: updated })
                                        }}
                                        className="p-1.5 rounded-md hover:bg-rose-500/20 text-rose-400 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-[10px] text-white/30 italic text-center py-2 bg-white/[0.02] rounded-lg border border-dashed border-white/5">
                            No conditional rules added. Default fields will be used.
                        </div>
                    )}

                    {/* Add New Rule Form */}
                    <div className="pt-2 border-t border-white/5 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                            id="cond-trigger-input"
                            className="bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 font-mono focus:border-amber-500/50 outline-none"
                            placeholder="Trigger (e.g. NO_NUMBERS)"
                        />
                        <input
                            id="cond-status-input"
                            className="bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 font-mono focus:border-amber-500/50 outline-none"
                            placeholder="Status (e.g. NO_NUMBERS)"
                        />
                        <div className="flex gap-2">
                            <input
                                id="cond-error-input"
                                className="w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 font-mono focus:border-amber-500/50 outline-none"
                                placeholder="Error (optional)"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    const trigger = (document.getElementById('cond-trigger-input') as HTMLInputElement)?.value?.trim()
                                    const status = (document.getElementById('cond-status-input') as HTMLInputElement)?.value?.trim()
                                    const error = (document.getElementById('cond-error-input') as HTMLInputElement)?.value?.trim()
                                    if (!trigger) return

                                    const rule: any = {}
                                    if (status) rule.status = status
                                    if (error) rule.error = error

                                    setMapping({
                                        conditionalFields: {
                                            ...(currentMapping.conditionalFields || {}),
                                            [trigger]: rule
                                        }
                                    })

                                    ;(document.getElementById('cond-trigger-input') as HTMLInputElement).value = ''
                                    ;(document.getElementById('cond-status-input') as HTMLInputElement).value = ''
                                    ;(document.getElementById('cond-error-input') as HTMLInputElement).value = ''
                                }}
                                className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 shrink-0 transition-all"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function StaticCatalogEditor({
    staticCatalog,
    onChange
}: {
    staticCatalog: any,
    onChange: (newCatalog: any) => void
}) {
    const catalog = typeof staticCatalog === 'string' ? (safeParse(staticCatalog) || {}) : (staticCatalog || {})
    const countriesStr = JSON.stringify(catalog.countries || [], null, 2)
    const servicesStr = JSON.stringify(catalog.services || [], null, 2)

    const [countriesJson, setCountriesJson] = useState(countriesStr)
    const [servicesJson, setServicesJson] = useState(servicesStr)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    useEffect(() => {
        setCountriesJson(countriesStr)
        setServicesJson(servicesStr)
    }, [countriesStr, servicesStr])

    const updateCatalog = (newCountries: string, newServices: string) => {
        setCountriesJson(newCountries)
        setServicesJson(newServices)

        try {
            const parsedCountries = newCountries.trim() ? JSON.parse(newCountries) : []
            const parsedServices = newServices.trim() ? JSON.parse(newServices) : []

            if (!Array.isArray(parsedCountries)) throw new Error('Static Countries must be a JSON array []')
            if (!Array.isArray(parsedServices)) throw new Error('Static Services must be a JSON array []')

            setErrorMsg(null)

            onChange({
                countries: parsedCountries,
                services: parsedServices
            })
        } catch (e: any) {
            setErrorMsg(e.message)
        }
    }

    const formatJson = () => {
        try {
            const cObj = countriesJson.trim() ? JSON.parse(countriesJson) : []
            const sObj = servicesJson.trim() ? JSON.parse(servicesJson) : []
            updateCatalog(JSON.stringify(cObj, null, 2), JSON.stringify(sObj, null, 2))
        } catch (e: any) {
            setErrorMsg(`Format Error: ${e.message}`)
        }
    }

    const insertTemplate = () => {
        const cTemplate = [
            { "code": "us", "name": "United States" },
            { "code": "in", "name": "India" }
        ]
        const sTemplate = [
            { "code": "wa", "name": "WhatsApp" },
            { "code": "tg", "name": "Telegram" }
        ]
        updateCatalog(JSON.stringify(cTemplate, null, 2), JSON.stringify(sTemplate, null, 2))
    }

    return (
        <div className="space-y-4 p-4 bg-black/40 border border-white/10 rounded-xl">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Static Catalog Fallback (JSON)</h4>
                    <p className="text-[10px] text-white/50">Used when provider has no getCountriesList or getServicesList API endpoints.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={insertTemplate}
                        className="px-2.5 py-1 text-[10px] rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors border border-purple-500/30"
                    >
                        Load Example Template
                    </button>
                    <button
                        onClick={formatJson}
                        className="px-2.5 py-1 text-[10px] rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors border border-blue-500/30"
                    >
                        Format & Validate JSON
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="p-2.5 text-[11px] bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg">
                    ⚠️ {errorMsg}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">Static Countries JSON</label>
                    <textarea
                        rows={8}
                        className="w-full p-2.5 text-[11px] font-mono bg-black/60 border border-white/10 rounded-lg text-emerald-300 focus:outline-none focus:border-emerald-500/50"
                        placeholder={'[\n  { "code": "us", "name": "United States" }\n]'}
                        value={countriesJson}
                        onChange={(e) => updateCatalog(e.target.value, servicesJson)}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">Static Services JSON</label>
                    <textarea
                        rows={8}
                        className="w-full p-2.5 text-[11px] font-mono bg-black/60 border border-white/10 rounded-lg text-emerald-300 focus:outline-none focus:border-emerald-500/50"
                        placeholder={'[\n  { "code": "wa", "name": "WhatsApp", "countries": ["us"] }\n]'}
                        value={servicesJson}
                        onChange={(e) => updateCatalog(countriesJson, e.target.value)}
                    />
                </div>
            </div>
        </div>
    )
}
