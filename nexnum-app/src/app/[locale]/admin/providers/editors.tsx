import React, { useState } from "react"
import { Input } from "@/components/ui/input"
import { Globe, Search } from "lucide-react"

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
    'setResendCode',
    'setCancel',
    'setComplete'
] as const

export type EndpointMethod = typeof ENDPOINT_METHODS[number]

/**
 * Method Parameters
 * - Required: authKey (all), country/service (context-dependent)
 * - Optional: maxPrice, operator
 */
export const METHOD_PARAMS: Record<EndpointMethod, string[]> = {
    getBalance: ['{authKey}'],
    getCountriesList: ['{service}', '{authKey}'],          // service: optional filter
    getServicesList: ['{country}', '{authKey}'],           // country: optional filter
    getPrices: ['{country}', '{service}', '{authKey}'],
    getNumber: ['{country}', '{service}', '{maxPrice}', '{operator}', '{authKey}'],
    getStatus: ['{id}', '{authKey}'],
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
        </div>
    )
}
