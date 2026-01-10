"use client"

import React, { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
    Search, Plus, Server, Globe, Shield, RefreshCw,
    MoreHorizontal, CheckCircle, XCircle, AlertCircle, ChevronRight, ChevronDown, Copy, Check,
    Trash2, Edit, Save, Play, Terminal, Upload, Image, DollarSign, FileCode,
    Wallet, MapPin, Smartphone, Phone, BarChart3, Ban, Plug, Sparkles, Info, Wand2,
    Lock, Key, Link, FileText, X, Eye, Settings, Package
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PremiumSkeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import ProviderWizard from "./ProviderWizard"
import { EndpointEditor, MappingEditor, safeParse, PROVIDER_TEMPLATES } from "./editors"
import { ProviderAIHub } from "./ProviderAIHub"
import { JsonEditor } from "@/components/ui/json-editor"
import { InfoTooltip, TT, TTCode } from "@/components/ui/tooltip"

// Types
interface Provider {
    id: string
    name: string
    displayName: string
    description?: string
    logoUrl?: string
    apiBaseUrl: string
    authType: string
    authKey?: string // Usually hidden
    isActive: boolean
    priority: number
    endpoints: any
    mappings: any
    providerType?: string // rest, hybrid, sms-activate
    lastTest?: { success: boolean; testedAt: string; responseTime: number; responseData?: string; error?: string } | null
    syncCount: number
    updatedAt: string
    // Pricing
    priceMultiplier: number
    fixedMarkup: number
    currency: string
}



// ------------------------------------------------------------------
// Helper Components for API Test Console
// ------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation() // Prevent row toggle if inside clickable area
        navigator.clipboard.writeText(text)
        setCopied(true)
        toast.success("Copied to clipboard")
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors border border-white/5"
            title="Copy JSON"
        >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
    )
}

function SyntaxHighlightedJson({ data }: { data: any }) {
    // If string, try to parse it first to ensure pretty printing
    let jsonString = ''
    try {
        const obj = typeof data === 'string' ? JSON.parse(data) : data
        // Handle null/undefined gracefully
        if (obj === null || obj === undefined) {
            jsonString = String(obj)
        } else {
            jsonString = JSON.stringify(obj, null, 2) || '{}'
        }
    } catch {
        jsonString = String(data)
    }

    // Tokenize JSON for syntax highlighting
    const tokens = jsonString.split(/(".*?"|true|false|null|-?\d+(?:\.\d*)?|[{},:[\]])/g).filter(Boolean)

    return (
        <code className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all">
            {tokens.map((token, i) => {
                let color = "text-purple-300/60" // Punctuation/Brackets

                if (token.startsWith('"')) {
                    if (token.endsWith('":')) {
                        color = "text-blue-300" // Keys
                    } else {
                        color = "text-emerald-300" // String Values
                    }
                } else if (/true|false/.test(token)) {
                    color = "text-orange-400 font-bold" // Booleans
                } else if (/null/.test(token)) {
                    color = "text-red-400 italic" // Null
                } else if (/^-?\d/.test(token)) {
                    color = "text-amber-300" // Numbers
                }

                return <span key={i} className={color}>{token}</span>
            })}
        </code>
    )
}

export default function ProvidersPage() {
    const [providers, setProviders] = useState<Provider[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // State for Sheet
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
    const [isSheetOpen, setIsSheetOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => setMounted(true), [])

    // Fetch Data
    const fetchProviders = async () => {
        try {
            const res = await fetch('/api/admin/providers')
            if (!res.ok) throw new Error('Failed to fetch')
            const data = await res.json()
            setProviders(data)
        } catch (error) {
            toast.error("Failed to load providers")
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchProviders()
    }, [])

    const openCreate = () => {
        setSelectedProvider(null)
        setIsCreating(true)
        setIsSheetOpen(true)
    }

    const openEdit = (provider: Provider) => {
        setSelectedProvider(provider)
        setIsCreating(false)
        setIsSheetOpen(true)
    }

    const closeSheet = () => {
        setIsSheetOpen(false)
        setSelectedProvider(null)
    }

    // Filter
    const filteredProviders = providers.filter(p =>
        p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-8 min-h-screen pb-24 md:pb-20">
            {/* Header */}
            <div className="flex flex-col gap-3 md:gap-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-xl md:text-3xl font-bold text-white tracking-tight">Providers</h1>
                        <p className="text-white/40 text-xs md:text-sm mt-1">Manage upstream SMS service providers</p>
                    </div>
                    <div className="w-full md:w-auto flex gap-3">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <Input
                                placeholder="Search providers..."
                                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/20 h-9 md:h-10 text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button onClick={() => openCreate()} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white h-9 md:h-10 text-xs md:text-sm font-medium">
                            <Plus className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Add Provider</span>
                            <span className="md:hidden">Add</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Grid - 1 col compact on mobile, 2 on tablet, 3 on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-6">
                <AnimatePresence>
                    {isLoading ? (
                        [...Array(6)].map((_, i) => (
                            <PremiumSkeleton key={i} className="h-16 md:h-64 rounded-lg md:rounded-xl bg-white/5" />
                        ))
                    ) : (
                        filteredProviders.map((provider) => (
                            <ProviderCard key={provider.id} provider={provider} onRefresh={fetchProviders} onEdit={() => openEdit(provider)} />
                        ))
                    )}
                </AnimatePresence>
            </div>

            {/* Provider Sheet Portal - Renders at root to cover EVERYTHING */}
            {mounted && createPortal(
                <AnimatePresence>
                    {isSheetOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={closeSheet}
                                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9990]"
                            />
                            <div className="fixed inset-0 z-[9999] pointer-events-none flex justify-end">
                                <div className="w-full md:max-w-2xl h-full pointer-events-auto">
                                    <ProviderSheet
                                        provider={selectedProvider}
                                        isCreating={isCreating}
                                        onClose={closeSheet}
                                        onRefresh={fetchProviders}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    )
}

function ProviderCard({ provider, onRefresh, onEdit }: { provider: Provider; onRefresh: () => void; onEdit: () => void }) {
    const [isSyncing, setIsSyncing] = useState(false)

    const handleSync = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsSyncing(true)
        try {
            const res = await fetch(`/api/admin/providers/${provider.id}/sync`, { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                toast.success(`Sync completed: ${data.countries} countries, ${data.services} services`)
                onRefresh()
            } else {
                toast.error(data.error || "Sync failed")
            }
        } catch (e) {
            toast.error("Sync request failed")
        } finally {
            setIsSyncing(false)
        }
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={onEdit}
            className="group relative bg-[#0A0A0A] border border-white/5 rounded-lg md:rounded-2xl overflow-hidden hover:border-white/10 transition-colors cursor-pointer"
        >
            {/* Mobile: Enhanced horizontal row with details */}
            <div className="md:hidden p-3 space-y-2">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center text-lg overflow-hidden shrink-0 border border-white/5">
                        {provider.logoUrl ? (
                            <img src={provider.logoUrl} alt={provider.displayName} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                            <SeverIcon name={provider.displayName} />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white text-sm truncate">{provider.displayName}</h3>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${provider.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {provider.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <p className="text-[10px] text-white/30 mt-0.5 truncate">Priority {provider.priority} • {provider.syncCount} syncs completed</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 bg-white/5 hover:bg-white/10 shrink-0 rounded-lg"
                        onClick={(e) => { e.stopPropagation(); handleSync(e); }}
                        disabled={isSyncing}
                    >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* Status bar */}
                <div className="flex items-center justify-between px-2 py-1.5 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-2 text-[10px]">
                        {provider.lastTest ? (
                            provider.lastTest.success ? (
                                <span className="text-green-400 flex items-center gap-1 font-medium">
                                    <CheckCircle className="w-3 h-3" />
                                    Connected • {formatDistanceToNow(new Date(provider.lastTest.testedAt))} ago
                                </span>
                            ) : (
                                <span className="text-red-400 flex items-center gap-1 font-medium">
                                    <XCircle className="w-3 h-3" />
                                    Connection Failed
                                </span>
                            )
                        ) : (
                            <span className="text-white/30 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Not tested yet
                            </span>
                        )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20" />
                </div>
            </div>

            {/* Desktop: Full card layout */}
            <div className="hidden md:block p-6 space-y-4">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl overflow-hidden shrink-0">
                            {provider.logoUrl ? (
                                <img src={provider.logoUrl} alt={provider.displayName} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            ) : (
                                <SeverIcon name={provider.displayName} />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-white text-base group-hover:text-blue-400 transition-colors truncate">{provider.displayName}</h3>
                            <div className="flex items-center gap-1.5 text-xs text-white/40 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${provider.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500'}`} />
                                {provider.isActive ? 'Active' : 'Inactive'}
                            </div>
                        </div>
                    </div>
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="h-8 w-8 flex items-center justify-center text-white/40 bg-white/5 rounded-full">
                            <Edit className="w-4 h-4" />
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 py-2">
                    <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-white/40 mb-1">Priority</div>
                        <div className="font-mono text-sm">{provider.priority}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-xs text-white/40 mb-1">Sync Jobs</div>
                        <div className="font-mono text-sm">{provider.syncCount}</div>
                    </div>
                </div>

                {/* Status Footer */}
                <div className="pt-2 border-t border-white/5 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2 text-white/40">
                        {provider.lastTest ? (
                            provider.lastTest.success ? (
                                <span className="flex items-center gap-1 text-green-400">
                                    <CheckCircle className="w-3 h-3" />
                                    Tested {formatDistanceToNow(new Date(provider.lastTest.testedAt))} ago
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-red-400">
                                    <XCircle className="w-3 h-3" /> Failed
                                </span>
                            )
                        ) : (
                            <span className="text-white/20">Never tested</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:block px-6 pb-6 pt-0">
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-white/5 border-white/5 hover:bg-white/10 hover:text-white border-transparent text-white/60 justify-center group/btn text-sm h-9"
                    onClick={handleSync}
                    disabled={isSyncing}
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                </Button>
            </div>
        </motion.div>
    )
}

function SeverIcon({ name }: { name: string }) {
    return <span className="font-bold text-white/20">{name.substring(0, 2).toUpperCase()}</span>
}


function ProviderSheet({ provider, isCreating, onClose, onRefresh }: any) {
    const [activeTab, setActiveTab] = useState<'settings' | 'pricing' | 'mappings' | 'test' | 'ai'>('settings')
    const [formData, setFormData] = useState({
        name: '', displayName: '', apiBaseUrl: '', authType: 'bearer', authKey: '',
        authQueryParam: '', authHeader: '',
        endpoints: '{\n  "getCountries": { "method": "GET", "path": "" }\n}',
        mappings: '{\n  "getCountries": { "type": "json_object", "rootPath": "$" }\n}',
        isActive: false, priority: 0, providerType: 'rest',
        priceMultiplier: '1.0', fixedMarkup: '0.00', currency: 'USD'
    })

    const [mappingMode, setMappingMode] = useState<'visual' | 'raw'>('visual')
    const [endpointMode, setEndpointMode] = useState<'visual' | 'raw'>('visual')

    const [isSaving, setIsSaving] = useState(false)
    const [testResult, setTestResult] = useState<any>(null)
    const [isTesting, setIsTesting] = useState(false)
    const [isFixing, setIsFixing] = useState(false)

    // Testing State
    const [testAction, setTestAction] = useState('test')
    const [testParams, setTestParams] = useState({ country: '', service: '', operator: '', maxPrice: '', id: '', status: '' })
    const [testResults, setTestResults] = useState<Record<string, any>>({}) // Multi-test results
    const [expandedTest, setExpandedTest] = useState<string | null>(null) // Which test row is expanded
    const [selectedMapping, setSelectedMapping] = useState<string>('') // Legacy prop, can reuse if needed or remove

    // Logo upload states
    const [logoPreview, setLogoPreview] = useState<string | null>(provider?.logoUrl || null)
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = React.useRef<HTMLInputElement>(null)
    const [isDynamicExpanded, setIsDynamicExpanded] = useState(false)

    useEffect(() => {
        if (provider) {
            setFormData({
                name: provider.name,
                displayName: provider.displayName,
                apiBaseUrl: provider.apiBaseUrl,
                authType: provider.authType,
                authKey: '', // Don't show existing key 
                authQueryParam: (provider as any).authQueryParam || '',
                authHeader: (provider as any).authHeader || '',
                endpoints: JSON.stringify(provider.endpoints || {}, null, 2),
                mappings: JSON.stringify(provider.mappings || {}, null, 2),
                isActive: provider.isActive,
                priority: provider.priority,
                providerType: provider.providerType || 'rest',
                priceMultiplier: String(provider.priceMultiplier || 1.0),
                fixedMarkup: String(provider.fixedMarkup || 0.00),
                currency: provider.currency || 'USD'
            })
            // Reset test state on provider open
            setTestAction('test')
            setTestResult(null)
            setTestResults({}) // Reset multi-test results too
            setTestParams({ country: '', service: '', operator: '', maxPrice: '', id: '', status: '' })
            setMappingMode('visual')
            setEndpointMode('visual')
        }
    }, [provider])

    const handleWizardComplete = async (wizardData: any) => {
        setIsSaving(true)
        try {
            const body: any = {
                ...wizardData,
                endpoints: wizardData.endpoints,
                mappings: wizardData.mappings
            }
            // Ensure numbers
            body.priority = Number(body.priority)
            body.priceMultiplier = Number(body.priceMultiplier)
            body.fixedMarkup = Number(body.fixedMarkup)

            const res = await fetch('/api/admin/providers', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json' }
            })

            if (res.ok) {
                toast.success("Provider created successfully")
                onRefresh()
                onClose()
            } else {
                const data = await res.json()
                toast.error(data.error || "Creation failed")
            }
        } catch (e) {
            toast.error("Format error")
        } finally {
            setIsSaving(false)
        }
    }

    if (isCreating) {
        return (
            <motion.div
                initial={{ opacity: 0, x: '100%' }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: '100%' }}
                className="fixed inset-y-0 right-0 w-full sm:w-[600px] bg-[#0A0A0A] border-l border-white/5 shadow-2xl z-50 flex flex-col p-6"
            >
                <ProviderWizard onComplete={handleWizardComplete} onCancel={onClose} />
            </motion.div>
        )
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const body: any = {
                ...formData,
                endpoints: JSON.parse(formData.endpoints),
                mappings: JSON.parse(formData.mappings)
            }
            if (!formData.authKey) delete body.authKey

            const url = isCreating ? '/api/admin/providers' : `/api/admin/providers/${provider.id}`
            const method = isCreating ? 'POST' : 'PATCH'

            const res = await fetch(url, {
                method,
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json' }
            })

            if (res.ok) {
                toast.success(isCreating ? "Provider created" : "Provider updated")
                onRefresh()
                // Don't close panel - stay on editing view
            } else {
                const data = await res.json()
                toast.error(data.error || "Operation failed")
            }
        } catch (e) {
            toast.error("Invalid JSON format or network error")
        } finally {
            setIsSaving(false)
        }
    }

    const runTest = async (action: string, overrides?: any) => {
        if (!provider) return
        setIsTesting(true)
        setTestAction(action) // Sync UI state
        // Don't clear single result immediately if running chain? 
        // Actually, for UI feedback we usually want to see the specific action. 
        // But for chain, it might flash.
        setTestResult(null)

        try {
            // Merge current params with overrides
            let currentParams = { ...testParams, ...overrides }

            // Auto-set default params for "quick tests" if empty
            if (action === 'getServices' && !currentParams.country) {
                // If we have countries from a previous test, maybe pick one?
            }

            const res = await fetch(`/api/admin/providers/${provider.id}/test`, {
                method: 'POST',
                body: JSON.stringify({
                    action: action,
                    params: currentParams
                }),
                headers: { 'Content-Type': 'application/json' }
            })
            const data = await res.json()

            // Parse nested JSON string in data if present
            let parsedData = null
            if (data.data && typeof data.data === 'string') {
                // Only try to parse if it looks like JSON (starts with { or [)
                const trimmed = data.data.trim()
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        parsedData = JSON.parse(data.data)
                    } catch (e) {
                        console.warn("Failed to parse response data as JSON", e)
                        parsedData = { raw: data.data } // Keep as raw
                    }
                } else {
                    // It's a plain text response (likely an error message)
                    parsedData = { raw: data.data }
                }
            } else {
                parsedData = data.data
            }

            const resultObj = { ...data, parsed: parsedData }

            setTestResult(resultObj)
            // Also store in multi-results for new table UI
            setTestResults(prev => ({ ...prev, [action]: resultObj }))

            if (res.ok && data.success) {
                toast.success(`${action} successful`)
                if (action === 'test' || action === 'getCountries') onRefresh()
            } else {
                toast.error(data.error || "Test failed")
            }

            return resultObj
        } catch (e) {
            toast.error("Test failed")
            return null
        } finally {
            setIsTesting(false)
        }
    }

    // Keep handleTest for legacy references if any, or just route it to runTest
    const handleTest = () => runTest(testAction)

    const handleSmartFix = async () => {
        setIsFixing(true)
        try {
            const errorContext = typeof testResult.data === 'string' ? testResult.data : JSON.stringify(testResult.data)
            const prompt = `TEST FAILED with error: ${errorContext}\n\nCurrent Config: ${JSON.stringify(formData)}\n\nAction: ${testAction}\nParams: ${JSON.stringify(testParams)}\n\nDiagnose the issue and return a FIXED configuration JSON. Focus on Mappings (regex/json paths) and Auth.\n\nRequired Format:\n{\n  "mappings": { ... },\n  "endpoints": { ... },\n  "authType": "..."\n}\n\nOnly return the fields that need changing.`

            const res = await fetch('/api/admin/ai-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, step: 5 }) // Reusing step 5 context for config generation
            })

            const data = await res.json()
            if (res.ok && data.result) {
                // Merge fixes
                setFormData(prev => ({
                    ...prev,
                    ...data.result,
                    // If deep objects, merge them? For now, top level replacement for endpoints/mappings is safer if AI returns full object
                    endpoints: data.result.endpoints ? JSON.stringify(data.result.endpoints, null, 2) : prev.endpoints,
                    mappings: data.result.mappings ? JSON.stringify(data.result.mappings, null, 2) : prev.mappings
                }))
                toast.success("AI applied fixes! Please try testing again.", { icon: <Wand2 className="w-4 h-4 text-violet-400" /> })
                setTestResult(null) // Clear error to encourage re-test
            } else {
                toast.error("AI could not fix the issue.")
            }
        } catch (e) {
            toast.error("Smart Fix failed")
        } finally {
            setIsFixing(false)
        }
    }


    const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this provider? This action cannot be undone.')) return
        setIsSaving(true)
        try {
            const res = await fetch(`/api/admin/providers/${provider.id}`, { method: 'DELETE' })
            const data = await res.json()
            if (res.ok) {
                toast.success("Provider deleted")
                onRefresh()
                onClose()
            } else {
                toast.error(data.error || "Delete failed")
            }
        } catch (e: any) {
            toast.error(e.message || "Delete failed")
        } finally {
            setIsSaving(false)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleUpload(e.target.files[0])
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUpload(e.dataTransfer.files[0])
        }
    }

    const handleUpload = async (file: File) => {
        if (!provider || isCreating) {
            toast.error("Please create the provider first before uploading a logo")
            return
        }

        setIsUploading(true)
        const formData = new FormData()
        formData.append('logo', file)

        try {
            const res = await fetch(`/api/admin/providers/${provider.id}/logo`, {
                method: 'POST',
                body: formData
            })
            const data = await res.json()

            if (res.ok) {
                setLogoPreview(data.logoUrl)
                toast.success("Logo uploaded successfully")
                onRefresh()
            } else {
                toast.error(data.error || "Upload failed")
            }
        } catch (e) {
            toast.error("Upload failed")
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 right-0 bottom-0 md:top-0 md:bottom-0 md:right-0 md:left-auto h-screen w-full md:w-auto md:max-w-2xl bg-[#0A0A0A] border-l border-white/10 shadow-2xl z-[9999] flex flex-col"
            onClick={e => e.stopPropagation()}
        >
            {/* Header - Clean & Professional */}
            <div className="px-4 py-3 md:p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-black/40 to-transparent">
                <div className="flex items-center gap-3">
                    {logoPreview && (
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-white/5 overflow-hidden shrink-0">
                            <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                        </div>
                    )}
                    <div>
                        <h2 className="text-base md:text-lg font-bold text-white">{isCreating ? 'Add Provider' : formData.displayName || 'Edit Provider'}</h2>
                        <p className="text-[10px] md:text-xs text-white/40">{isCreating ? 'Configure new SMS provider' : `@${provider?.name}`}</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 md:h-10 md:w-10 hover:bg-white/10 rounded-full"><XCircle className="w-4 h-4 md:w-5 md:h-5 text-white/40 hover:text-white" /></Button>
            </div>

            {/* Tabs - Scrollable on mobile */}
            <div className="border-b border-white/5 overflow-x-auto scrollbar-hide">
                <nav className="flex px-4 md:px-6 min-w-max">
                    <button onClick={() => setActiveTab('settings')} className={`px-3 md:px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'settings' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white'}`}>Settings</button>
                    <button onClick={() => setActiveTab('pricing')} className={`px-3 md:px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'pricing' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white'}`}>Pricing</button>
                    <button onClick={() => setActiveTab('mappings')} className={`px-3 md:px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'mappings' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white'}`}>Mappings</button>
                    <button onClick={() => setActiveTab('test')} className={`px-3 md:px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'test' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white'}`}>Test</button>
                    <button onClick={() => setActiveTab('ai')} className={`px-3 md:px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'ai' ? 'border-purple-500 text-purple-400' : 'border-transparent text-white/40 hover:text-purple-300'}`}>
                        <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3" />AI Manager</span>
                    </button>
                </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 pb-28 md:pb-6">

                {activeTab === 'settings' && (
                    <div className="space-y-5">
                        {/* Template Loader - Keep existing if isCreating */}
                        {isCreating && (
                            <div className="flex items-center gap-2 mb-4 p-3 bg-gradient-to-r from-blue-500/10 to-transparent rounded-xl border border-blue-500/20">
                                <FileCode className="w-5 h-5 text-blue-400" />
                                <span className="text-sm text-white/60 flex-1">Quick start with template:</span>
                                <select
                                    onChange={(e) => {
                                        const template = PROVIDER_TEMPLATES[e.target.value]
                                        if (template) {
                                            setFormData({
                                                ...formData,
                                                name: e.target.value,
                                                displayName: template.displayName,
                                                apiBaseUrl: template.apiBaseUrl,
                                                authType: template.authType,
                                                endpoints: JSON.stringify(template.endpoints, null, 2),
                                                mappings: JSON.stringify(template.mappings, null, 2),
                                            })
                                        }
                                    }}
                                    defaultValue=""
                                    className="h-9 px-3 rounded-lg bg-blue-500/20 border border-blue-500/30 text-xs font-medium text-blue-300 focus:outline-none cursor-pointer"
                                >
                                    <option value="" disabled>Choose template...</option>
                                    {Object.keys(PROVIDER_TEMPLATES).map((key) => (
                                        <option key={key} value={key}>{PROVIDER_TEMPLATES[key].displayName}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Logo Upload Section */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center">
                                    <Image className="w-4 h-4 text-pink-400" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-white block">Provider Logo</label>
                                    <span className="text-[10px] text-white/40">Upload a logo for visual identification</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 relative">
                                    {logoPreview ? (
                                        <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                                    ) : (
                                        <Image className="w-6 h-6 text-white/20" />
                                    )}
                                    {isUploading && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <RefreshCw className="w-4 h-4 animate-spin text-white" />
                                        </div>
                                    )}
                                </div>
                                <div
                                    className={`flex-1 border-2 border-dashed rounded-xl p-4 transition-colors text-center cursor-pointer ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/png, image/jpeg, image/svg+xml, image/webp"
                                        onChange={handleFileSelect}
                                    />
                                    <div className="flex flex-col items-center gap-1 text-xs text-white/40">
                                        <Upload className="w-5 h-5 mb-1 text-white/30" />
                                        <span className="font-medium text-white/60">Click to upload</span>
                                        <span>or drag & drop SVG, PNG, JPG</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Display Name Field */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                    <Edit className="w-4 h-4 text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <label className="text-sm font-medium text-white">Display Name</label>
                                        <InfoTooltip content={<>The <TT>friendly name</TT> shown to users in the UI. Choose something recognizable like <TTCode>5sim</TTCode> or <TTCode>SMS-Activate</TTCode>.</>} />
                                    </div>
                                    <span className="text-[10px] text-white/40">Shown to users in the interface</span>
                                </div>
                            </div>
                            <Input
                                value={formData.displayName}
                                onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                className="bg-black/30 border-white/10 text-white h-11 text-sm"
                                placeholder="e.g. 5sim, SMS-Activate, GrizzlySMS"
                            />
                        </div>

                        {/* Internal Slug Field */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                    <Terminal className="w-4 h-4 text-purple-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <label className="text-sm font-medium text-white">Internal Slug</label>
                                        <InfoTooltip content={<>A <TT>unique machine-readable</TT> identifier. Use <TT>lowercase letters</TT>, numbers, and underscores only. Example: <TTCode>fivesim</TTCode>, <TTCode>sms_activate</TTCode>. <TT>Cannot be changed</TT> after creation.</>} />
                                    </div>
                                    <span className="text-[10px] text-white/40">Unique identifier used in API calls (lowercase, no spaces)</span>
                                </div>
                            </div>
                            <Input
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                                className="bg-black/30 border-white/10 text-white font-mono h-11 text-sm"
                                disabled={!isCreating}
                                placeholder="e.g. fivesim, sms_activate"
                            />
                            {!isCreating && (
                                <p className="text-[10px] text-yellow-500/70 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Cannot be changed after creation
                                </p>
                            )}
                        </div>

                        {/* API Base URL Field */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                                    <Globe className="w-4 h-4 text-green-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <label className="text-sm font-medium text-white">API Base URL</label>
                                        <InfoTooltip content={<>The <TT>root URL</TT> for all API requests. Endpoints will be appended to this. Example: <TTCode>https://5sim.net/v1</TTCode></>} />
                                    </div>
                                    <span className="text-[10px] text-white/40">The root URL for all API endpoints</span>
                                </div>
                            </div>
                            <Input
                                value={formData.apiBaseUrl}
                                onChange={e => setFormData({ ...formData, apiBaseUrl: e.target.value })}
                                className="bg-black/30 border-white/10 font-mono text-sm text-white/80 h-11"
                                placeholder="https://api.provider.com/v1"
                            />
                        </div>

                        <div className="p-4 bg-gradient-to-r from-orange-500/5 to-amber-500/5 rounded-xl border border-orange-500/20">
                            <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                                        <Plug className="w-4 h-4 text-orange-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm font-medium text-white">Hybrid Mode</label>
                                            <div className="px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/30 text-[8px] font-bold text-orange-400 uppercase tracking-wider">Legacy</div>
                                        </div>
                                        <p className="text-[10px] text-white/40 max-w-xs">
                                            Enable for legacy providers (SMS-Activate style) using query params in endpoints
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setFormData({ ...formData, providerType: formData.providerType === 'hybrid' ? 'rest' : 'hybrid' })}
                                    className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${formData.providerType === 'hybrid' ? 'bg-orange-500' : 'bg-white/10'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.providerType === 'hybrid' ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>
                        </div>

                        {/* Dynamic Engine Functions */}
                        {(() => {
                            const currentMappings = safeParse(formData.mappings)
                            const dynamicFns = currentMappings?.dynamicFunctions || {}
                            const allFunctions = ['getBalance', 'getCountries', 'getServices', 'getPrices', 'getNumber', 'getStatus', 'setStatus', 'cancelNumber']
                            const enabledCount = allFunctions.filter(fn => dynamicFns[fn]).length
                            const allEnabled = enabledCount === allFunctions.length
                            const someEnabled = enabledCount > 0

                            return (
                                <div className="p-4 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 rounded-xl border border-blue-500/20 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                <Sparkles className="w-4 h-4 text-blue-400" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <label className="text-sm font-medium text-white">Dynamic Engine</label>
                                                    <div className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-[8px] font-bold text-blue-400 uppercase tracking-wider">Experimental</div>
                                                    {someEnabled && !allEnabled && (
                                                        <div className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-[8px] font-bold text-amber-400 tracking-wider">
                                                            {enabledCount}/{allFunctions.length}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-white/40">
                                                    Select which functions use the dynamic config engine
                                                </p>
                                            </div>
                                        </div>
                                        {/* Controls */}
                                        <div className="flex items-center gap-2">
                                            {/* Expand/Collapse Button */}
                                            <button
                                                onClick={() => setIsDynamicExpanded(!isDynamicExpanded)}
                                                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                            >
                                                <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${isDynamicExpanded ? '' : '-rotate-90'}`} />
                                            </button>

                                            <span className="text-[10px] text-white/40 hidden md:inline">All</span>
                                            <button
                                                onClick={() => {
                                                    // If any are enabled, turn all OFF. If none enabled, turn all ON.
                                                    const newDynamicFunctions = someEnabled
                                                        ? {}
                                                        : { getBalance: true, getCountries: true, getServices: true, getPrices: true, getNumber: true, getStatus: true, setStatus: true, cancelNumber: true }
                                                    setFormData({
                                                        ...formData,
                                                        mappings: JSON.stringify({
                                                            ...currentMappings,
                                                            dynamicFunctions: newDynamicFunctions,
                                                            useDynamicMetadata: !someEnabled
                                                        }, null, 2)
                                                    })
                                                }}
                                                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${someEnabled ? 'bg-blue-500' : 'bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${someEnabled ? 'left-6' : 'left-1'}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Individual Function Toggles - Collapsible */}
                                    <AnimatePresence>
                                        {isDynamicExpanded && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                    {[
                                                        { key: 'getBalance', label: 'Balance', icon: DollarSign, desc: 'Check funds', color: 'emerald' },
                                                        { key: 'getCountries', label: 'Countries', icon: Globe, desc: 'List all', color: 'blue' },
                                                        { key: 'getServices', label: 'Services', icon: Package, desc: 'By country', color: 'violet' },
                                                        { key: 'getPrices', label: 'Prices', icon: BarChart3, desc: 'Get pricing', color: 'amber' },
                                                        { key: 'getNumber', label: 'Buy Number', icon: Phone, desc: 'Purchase', color: 'green' },
                                                        { key: 'getStatus', label: 'Get Status', icon: Eye, desc: 'Check SMS', color: 'cyan' },
                                                        { key: 'setStatus', label: 'Set Status', icon: Settings, desc: 'Confirm/Cancel', color: 'orange' },
                                                        { key: 'cancelNumber', label: 'Cancel', icon: XCircle, desc: 'Refund', color: 'red' },
                                                    ].map((fn) => {
                                                        const Icon = fn.icon
                                                        const isEnabled = dynamicFns[fn.key] ?? currentMappings?.useDynamicMetadata ?? false
                                                        const colorMap: Record<string, { bg: string; border: string; text: string; active: string }> = {
                                                            emerald: { bg: 'from-emerald-500/20 to-emerald-600/10', border: 'border-emerald-500/30', text: 'text-emerald-400', active: 'bg-emerald-500' },
                                                            blue: { bg: 'from-blue-500/20 to-blue-600/10', border: 'border-blue-500/30', text: 'text-blue-400', active: 'bg-blue-500' },
                                                            violet: { bg: 'from-violet-500/20 to-violet-600/10', border: 'border-violet-500/30', text: 'text-violet-400', active: 'bg-violet-500' },
                                                            amber: { bg: 'from-amber-500/20 to-amber-600/10', border: 'border-amber-500/30', text: 'text-amber-400', active: 'bg-amber-500' },
                                                            green: { bg: 'from-green-500/20 to-green-600/10', border: 'border-green-500/30', text: 'text-green-400', active: 'bg-green-500' },
                                                            cyan: { bg: 'from-cyan-500/20 to-cyan-600/10', border: 'border-cyan-500/30', text: 'text-cyan-400', active: 'bg-cyan-500' },
                                                            orange: { bg: 'from-orange-500/20 to-orange-600/10', border: 'border-orange-500/30', text: 'text-orange-400', active: 'bg-orange-500' },
                                                            red: { bg: 'from-red-500/20 to-red-600/10', border: 'border-red-500/30', text: 'text-red-400', active: 'bg-red-500' },
                                                        }
                                                        const colorClasses = colorMap[fn.color] || colorMap.blue

                                                        return (
                                                            <button
                                                                key={fn.key}
                                                                onClick={() => {
                                                                    const newVal = !isEnabled
                                                                    setFormData({
                                                                        ...formData,
                                                                        mappings: JSON.stringify({
                                                                            ...currentMappings,
                                                                            dynamicFunctions: { ...dynamicFns, [fn.key]: newVal }
                                                                        }, null, 2)
                                                                    })
                                                                }}
                                                                className={`relative p-3 rounded-xl border transition-all ${isEnabled
                                                                    ? `bg-gradient-to-br ${colorClasses.bg} ${colorClasses.border} shadow-lg`
                                                                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                                    }`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isEnabled ? colorClasses.bg : 'bg-white/10'
                                                                        }`}>
                                                                        <Icon className={`w-3 h-3 ${isEnabled ? colorClasses.text : 'text-white/40'}`} />
                                                                    </div>
                                                                    <div className="text-left flex-1 min-w-0">
                                                                        <div className={`text-xs font-medium truncate ${isEnabled ? 'text-white' : 'text-white/60'}`}>
                                                                            {fn.label}
                                                                        </div>
                                                                        <div className="text-[9px] text-white/40 truncate">{fn.desc}</div>
                                                                    </div>
                                                                    {/* Mini toggle indicator */}
                                                                    <div className={`w-3 h-3 rounded-full shrink-0 ${isEnabled ? colorClasses.active : 'bg-white/20'
                                                                        }`} />
                                                                </div>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )
                        })()}

                        {/* Security & Access Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-white/10 flex items-center justify-center">
                                        <Lock className="w-4 h-4 text-orange-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white">Security & Access</h3>
                                        <p className="text-[10px] text-white/40">Configure API authentication method</p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setActiveTab('ai')}
                                    className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 hover:from-violet-500/30 hover:to-fuchsia-500/30 border border-violet-500/30 rounded-xl text-xs font-medium text-violet-300 transition-all shadow-sm shadow-violet-500/10 group"
                                >
                                    <Sparkles className="w-3.5 h-3.5 text-violet-400 group-hover:rotate-12 transition-transform" />
                                    <span className="hidden md:inline">AI Assistant</span>
                                    <span className="md:hidden">AI</span>
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {[
                                    { value: 'bearer', label: 'Bearer', icon: Key, desc: 'JWT/Token', color: 'orange' },
                                    { value: 'header', label: 'Header', icon: Shield, desc: 'Custom key', color: 'blue' },
                                    { value: 'query_param', label: 'Query', icon: Link, desc: 'URL param', color: 'emerald' },
                                    { value: 'none', label: 'Template', icon: FileText, desc: '{authKey}', color: 'purple' },
                                ].map((auth) => {
                                    const Icon = auth.icon
                                    const isSelected = formData.authType === auth.value
                                    return (
                                        <button
                                            key={auth.value}
                                            onClick={() => setFormData({ ...formData, authType: auth.value })}
                                            className={`p-3 rounded-xl border transition-all text-left group ${isSelected
                                                ? 'bg-orange-500/20 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                                                : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                                                }`}
                                        >
                                            <div className={`w-7 h-7 rounded-lg mb-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-orange-500/30' : 'bg-white/10 group-hover:bg-white/15'}`}>
                                                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-orange-400' : 'text-white/50'}`} />
                                            </div>
                                            <div className={`text-[11px] font-medium ${isSelected ? 'text-orange-300' : 'text-white/70'}`}>{auth.label}</div>
                                            <div className="text-[9px] text-white/30 truncate">{auth.desc}</div>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Conditional Auth Config Fields */}
                            {(formData.authType === 'query_param' || formData.authType === 'header') && (
                                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${formData.authType === 'query_param' ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                                            {formData.authType === 'query_param' ? <Link className="w-3.5 h-3.5 text-emerald-400" /> : <Shield className="w-3.5 h-3.5 text-blue-400" />}
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-xs font-medium text-white">
                                                {formData.authType === 'query_param' ? 'Parameter Name' : 'Header Name'}
                                            </label>
                                            <span className="text-[9px] text-white/30 ml-2">
                                                {formData.authType === 'query_param' ? 'e.g. api_key, token' : 'e.g. X-API-KEY'}
                                            </span>
                                        </div>
                                    </div>
                                    <Input
                                        value={formData.authType === 'query_param' ? formData.authQueryParam : formData.authHeader}
                                        onChange={e => setFormData({
                                            ...formData,
                                            [formData.authType === 'query_param' ? 'authQueryParam' : 'authHeader']: e.target.value
                                        })}
                                        placeholder={formData.authType === 'query_param' ? 'api_key' : 'X-API-KEY'}
                                        className="h-10 bg-black/30 border-white/10 text-sm font-mono focus:border-blue-500/50 transition-all"
                                    />
                                </div>
                            )}

                            {/* API Secret Key Input */}
                            <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
                                        <Key className="w-3.5 h-3.5 text-red-400" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs font-medium text-white">API Secret Key</label>
                                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
                                                <Shield className="w-2 h-2 text-emerald-400" />
                                                <span className="text-[8px] font-bold text-emerald-400 uppercase">AES-256</span>
                                            </div>
                                        </div>
                                        <span className="text-[9px] text-white/30">Stored securely, never exposed</span>
                                    </div>
                                </div>
                                <Input
                                    type="password"
                                    value={formData.authKey}
                                    onChange={e => setFormData({ ...formData, authKey: e.target.value })}
                                    className="h-10 bg-black/30 border-white/10 text-sm font-mono focus:border-red-500/50 transition-all"
                                    placeholder={isCreating ? "sk_live_..." : "••••••••••••••••"}
                                />
                            </div>
                        </div>

                        {/* Priority */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                    <Server className="w-4 h-4 text-cyan-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <label className="text-sm font-medium text-white">Priority</label>
                                        <InfoTooltip content={<>Determines the order providers are tried. <TT>Lower = higher priority</TT>. If provider #1 fails, system tries #2. Use <TTCode>1</TTCode> for your primary provider.</>} />
                                    </div>
                                    <span className="text-[10px] text-white/40">Lower = higher priority (1 is first)</span>
                                </div>
                            </div>
                            <Input
                                type="number"
                                min="1"
                                max="100"
                                value={formData.priority}
                                onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
                                className="bg-black/30 border-white/10 text-white h-11 text-sm text-center font-bold"
                            />
                        </div>

                        {/* Active Provider Toggle */}
                        <div
                            onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${formData.isActive
                                ? 'bg-green-500/10 border-green-500/30 ring-1 ring-green-500/20'
                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${formData.isActive ? 'bg-green-500/30' : 'bg-white/10'
                                    }`}>
                                    {formData.isActive ? (
                                        <CheckCircle className="w-6 h-6 text-green-400" />
                                    ) : (
                                        <XCircle className="w-6 h-6 text-white/30" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h4 className={`text-sm font-semibold ${formData.isActive ? 'text-green-300' : 'text-white/70'}`}>
                                        {formData.isActive ? 'Provider Active' : 'Provider Inactive'}
                                    </h4>
                                    <p className="text-xs text-white/40">
                                        {formData.isActive
                                            ? 'This provider is available for live transactions'
                                            : 'Enable to make this provider available for use'}
                                    </p>
                                </div>
                                <div className={`w-14 h-8 rounded-full p-1 transition-all ${formData.isActive ? 'bg-green-500' : 'bg-white/20'
                                    }`}>
                                    <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-all ${formData.isActive ? 'translate-x-6' : 'translate-x-0'
                                        }`} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'pricing' && (
                    <div className="space-y-5">
                        {/* Header Card with Formula */}
                        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-blue-500/5 to-purple-500/10">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15),transparent_50%)]" />
                            <div className="relative p-4 md:p-5">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                                        <DollarSign className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-base font-bold text-white mb-1">Pricing Calculator</h4>
                                        <p className="text-xs text-white/50">Configure profit margins for this provider</p>
                                    </div>
                                </div>

                                {/* Formula Display */}
                                <div className="mt-4 p-3 bg-black/30 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-2 text-xs font-mono">
                                        <span className="text-white/40">Final Price</span>
                                        <span className="text-white/20">=</span>
                                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">Provider Cost</span>
                                        <span className="text-white/40">×</span>
                                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded">{formData.priceMultiplier || '1'}x</span>
                                        <span className="text-white/40">+</span>
                                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded">${formData.fixedMarkup || '0'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Multiplier Card */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                        <span className="text-emerald-400 font-bold text-sm">×</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <label className="text-sm font-medium text-white">Price Multiplier</label>
                                            <InfoTooltip content={<><TT>Multiplies</TT> the provider's price. <TTCode>1.5x</TTCode> = 50% profit. Example: provider charges $1 → user pays <TT>$1.50</TT></>} />
                                        </div>
                                        <span className="text-[10px] text-white/40">Percentage markup on base price</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-2xl font-bold text-emerald-400">{formData.priceMultiplier || 1}</span>
                                    <span className="text-sm text-white/40 ml-1">x</span>
                                </div>
                            </div>

                            {/* Slider */}
                            <div className="relative">
                                <input
                                    type="range"
                                    min="1"
                                    max="3"
                                    step="0.1"
                                    value={formData.priceMultiplier || 1}
                                    onChange={e => setFormData({ ...formData, priceMultiplier: e.target.value })}
                                    className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-500/40"
                                />
                                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                                    <span>1x (No profit)</span>
                                    <span>2x (+100%)</span>
                                    <span>3x (+200%)</span>
                                </div>
                            </div>

                            {/* Profit indicator */}
                            <div className="flex items-center gap-2 p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs text-emerald-300">
                                    {((parseFloat(formData.priceMultiplier || '1') - 1) * 100).toFixed(0)}% profit margin
                                </span>
                            </div>
                        </div>

                        {/* Fixed Markup Card */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                        <span className="text-purple-400 font-bold text-sm">+</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <label className="text-sm font-medium text-white">Fixed Markup</label>
                                            <InfoTooltip content={<>A <TT>flat fee</TT> added on top of the multiplied price. Example: <TTCode>1.2x + $0.10</TTCode> on $1 cost = user pays <TT>$1.30</TT></>} />
                                        </div>
                                        <span className="text-[10px] text-white/40">Flat fee added per transaction</span>
                                    </div>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 font-medium">$</span>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.fixedMarkup}
                                        onChange={e => setFormData({ ...formData, fixedMarkup: e.target.value })}
                                        className="w-24 pl-7 bg-white/10 border-purple-500/30 text-white text-right font-bold h-10"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Currency Selection */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                    <Globe className="w-4 h-4 text-blue-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <label className="text-sm font-medium text-white">Provider Currency</label>
                                        <InfoTooltip content={<>The <TT>currency</TT> in which the provider returns prices. NexNum handles <TT>conversion</TT> to your display currency automatically.</>} />
                                    </div>
                                    <span className="text-[10px] text-white/40">Source currency from API</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { code: 'USD', symbol: '$', name: 'US Dollar' },
                                    { code: 'EUR', symbol: '€', name: 'Euro' },
                                    { code: 'RUB', symbol: '₽', name: 'Ruble' },
                                    { code: 'INR', symbol: '₹', name: 'Rupee' },
                                ].map(currency => (
                                    <button
                                        key={currency.code}
                                        onClick={() => setFormData({ ...formData, currency: currency.code })}
                                        className={`p-3 rounded-xl border transition-all ${formData.currency === currency.code
                                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                            }`}
                                    >
                                        <div className="text-xl font-bold">{currency.symbol}</div>
                                        <div className="text-[10px] mt-1">{currency.code}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Example Calculator */}
                        <div className="p-4 bg-gradient-to-r from-white/5 to-transparent rounded-xl border border-white/5">
                            <h5 className="text-xs font-medium text-white/60 mb-3 flex items-center gap-2">
                                <Terminal className="w-3 h-3" />
                                Live Example
                            </h5>
                            <div className="flex items-center gap-3 text-sm">
                                <div className="flex-1 p-3 bg-black/30 rounded-lg text-center">
                                    <div className="text-white/40 text-[10px] mb-1">Provider</div>
                                    <div className="text-white font-mono">$1.00</div>
                                </div>
                                <span className="text-white/20">→</span>
                                <div className="flex-1 p-3 bg-emerald-500/10 rounded-lg text-center border border-emerald-500/20">
                                    <div className="text-emerald-400/60 text-[10px] mb-1">User Pays</div>
                                    <div className="text-emerald-400 font-mono font-bold">
                                        ${((1 * parseFloat(formData.priceMultiplier || '1')) + parseFloat(formData.fixedMarkup || '0')).toFixed(2)}
                                    </div>
                                </div>
                                <span className="text-white/20">→</span>
                                <div className="flex-1 p-3 bg-purple-500/10 rounded-lg text-center border border-purple-500/20">
                                    <div className="text-purple-400/60 text-[10px] mb-1">Profit</div>
                                    <div className="text-purple-400 font-mono font-bold">
                                        ${(((1 * parseFloat(formData.priceMultiplier || '1')) + parseFloat(formData.fixedMarkup || '0')) - 1).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'mappings' && (
                    <div className="space-y-4">
                        {/* Header Info Card - Compact */}
                        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-blue-500/10">
                            <div className="relative p-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 shrink-0">
                                        <FileCode className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-bold text-white">API Configuration</h4>
                                        <p className="text-[10px] text-white/50 truncate">Configure endpoints & response mappings for this provider</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Quick Reference - Scrollable */}
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-white">Expert Guides</span>
                                    <div className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 flex items-center gap-1">
                                        <Sparkles className="w-2.5 h-2.5 text-blue-400" />
                                        <span className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter">Deep Research</span>
                                    </div>
                                </div>
                                <span className="text-[9px] text-white/30 italic">Scroll →</span>
                            </div>
                            <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
                                <div className="grid grid-flow-col auto-cols-max gap-2">
                                    {/* Pro Tips */}
                                    <div className="w-52 p-2 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-lg border border-blue-500/20">
                                        <div className="text-[9px] font-bold text-blue-400 mb-2 flex items-center gap-1">
                                            <Info className="w-3 h-3" />
                                            PRO TIPS
                                        </div>
                                        <div className="space-y-1 text-[9px] text-white/50 leading-tight">
                                            <p>• Use <span className="text-blue-300 font-mono">authKey</span> placeholder for API keys.</p>
                                            <p>• Hybrid Mode allows mixing <span className="text-yellow-400">Full URLs</span> with Base URL paths.</p>
                                            <p>• Test response structure in the <span className="text-white">API Test Console</span> before mapping.</p>
                                        </div>
                                    </div>

                                    {/* Actions Reference */}
                                    <div className="w-48 p-2 bg-black/30 rounded-lg border border-white/10">
                                        <div className="text-[9px] font-medium text-white/40 mb-2">ENDPOINTS (Step 1)</div>
                                        <div className="space-y-1 text-[9px]">
                                            <div className="flex justify-between"><code className="text-white/70">getNumber</code><span className="text-white/30">Buy number</span></div>
                                            <div className="flex justify-between"><code className="text-white/70">getStatus</code><span className="text-white/30">Check SMS</span></div>
                                            <div className="flex justify-between"><code className="text-white/70">getBalance</code><span className="text-white/30">Check funds</span></div>
                                            <div className="flex justify-between"><code className="text-white/70">cancelNumber</code><span className="text-white/30">Refund</span></div>
                                        </div>
                                    </div>

                                    {/* Response Types */}
                                    <div className="w-52 p-2 bg-black/30 rounded-lg border border-white/10">
                                        <div className="text-[9px] font-medium text-white/40 mb-2">RESPONSE TYPES (Step 2)</div>
                                        <div className="space-y-1 text-[9px]">
                                            <div><code className="text-white/70">json_object</code><span className="text-white/30 ml-1">- Single object</span></div>
                                            <div><code className="text-white/70">json_array</code><span className="text-white/30 ml-1">- Array of items</span></div>
                                            <div><code className="text-white/70">json_dictionary</code><span className="text-white/30 ml-1">- Key-value pairs</span></div>
                                            <div><code className="text-white/70">text_regex</code><span className="text-white/30 ml-1">- Match pattern</span></div>
                                        </div>
                                    </div>

                                    {/* Fields by Action */}
                                    <div className="w-56 p-2 bg-black/30 rounded-lg border border-white/10">
                                        <div className="text-[9px] font-medium text-white/40 mb-2">FIELDS BY ACTION</div>
                                        <div className="space-y-1 text-[9px]">
                                            <div><span className="text-white/50">getNumber:</span><code className="text-white/70 ml-1">id, phone, price</code></div>
                                            <div><span className="text-white/50">getStatus:</span><code className="text-white/70 ml-1">status, code, sms</code></div>
                                            <div><span className="text-white/50">getBalance:</span><code className="text-white/70 ml-1">balance</code></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* STEP 1: Endpoints Config Card */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/30 to-cyan-500/20 flex items-center justify-center border border-blue-500/20">
                                        <span className="text-sm font-bold text-blue-400">1</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <label className="text-sm font-semibold text-white">Endpoints</label>
                                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[9px] font-medium rounded">API ROUTES</span>
                                            <InfoTooltip content={<>Define API routes for each action: <TTCode>getNumber</TTCode> (purchase), <TTCode>getStatus</TTCode> (check SMS), <TTCode>getBalance</TTCode>, <TTCode>cancelNumber</TTCode>. Use placeholders: <TTCode>{'{country}'}</TTCode>, <TTCode>{'{id}'}</TTCode></>} />
                                        </div>
                                        <span className="text-[10px] text-white/40">Where to send requests for each action</span>
                                    </div>
                                </div>
                                <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                                    <button
                                        onClick={() => setEndpointMode('visual')}
                                        className={`px-3 py-1.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1.5 ${endpointMode === 'visual'
                                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                                            : 'text-white/40 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        <Edit className="w-3 h-3" />
                                        Visual
                                    </button>
                                    <button
                                        onClick={() => setEndpointMode('raw')}
                                        className={`px-3 py-1.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1.5 ${endpointMode === 'raw'
                                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                                            : 'text-white/40 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        <Terminal className="w-3 h-3" />
                                        JSON
                                    </button>
                                </div>
                            </div>

                            {/* Actions Quick Ref */}
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { key: 'getNumber', label: 'Purchase', desc: 'Buy number' },
                                    { key: 'getStatus', label: 'Status', desc: 'Check SMS' },
                                    { key: 'getBalance', label: 'Balance', desc: 'Check funds' },
                                    { key: 'cancelNumber', label: 'Cancel', desc: 'Refund' },
                                ].map(action => (
                                    <div key={action.key} className="p-2 bg-black/20 rounded-lg border border-white/5 text-center">
                                        <code className="text-[9px] text-blue-400 font-mono block mb-0.5">{action.key}</code>
                                        <span className="text-[9px] text-white/30">{action.desc}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
                                {endpointMode === 'visual' ? (
                                    <div className="p-3">
                                        <EndpointEditor
                                            endpoints={safeParse(formData.endpoints)}
                                            onChange={(newEndpoints) => setFormData({ ...formData, endpoints: JSON.stringify(newEndpoints, null, 2) })}
                                        />
                                    </div>
                                ) : (
                                    <JsonEditor
                                        value={formData.endpoints}
                                        onChange={(val) => setFormData({ ...formData, endpoints: val })}
                                        minHeight="150px"
                                        maxHeight="250px"
                                    />
                                )}
                            </div>
                        </div>

                        {/* STEP 2: Response Mappings Card */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/20 flex items-center justify-center border border-purple-500/20">
                                        <span className="text-sm font-bold text-purple-400">2</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <label className="text-sm font-semibold text-white">Mappings</label>
                                            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[9px] font-medium rounded">RESPONSE PARSER</span>
                                            <InfoTooltip content={<>Extract data from API responses. Map JSON paths to fields: <TTCode>id</TTCode>, <TTCode>phone</TTCode>, <TTCode>status</TTCode>, <TTCode>code</TTCode>. Supports nested: <TTCode>data.phone</TTCode> or <TTCode>result[0].number</TTCode></>} />
                                        </div>
                                        <span className="text-[10px] text-white/40">How to extract data from responses</span>
                                    </div>
                                </div>
                                <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                                    <button
                                        onClick={() => setMappingMode('visual')}
                                        className={`px-3 py-1.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1.5 ${mappingMode === 'visual'
                                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                                            : 'text-white/40 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        <Edit className="w-3 h-3" />
                                        Visual
                                    </button>
                                    <button
                                        onClick={() => setMappingMode('raw')}
                                        className={`px-3 py-1.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1.5 ${mappingMode === 'raw'
                                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                                            : 'text-white/40 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        <Terminal className="w-3 h-3" />
                                        JSON
                                    </button>
                                </div>
                            </div>

                            {/* Fields Quick Ref */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {[
                                    { key: 'id', desc: 'Order ID' },
                                    { key: 'phone', desc: 'Phone number' },
                                    { key: 'status', desc: 'Current state' },
                                    { key: 'code', desc: 'SMS code' },
                                ].map(field => (
                                    <div key={field.key} className="p-2 bg-black/20 rounded-lg border border-white/5 flex items-center gap-2">
                                        <code className="text-[10px] text-purple-400 font-mono">{field.key}</code>
                                        <span className="text-[9px] text-white/30">→ {field.desc}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
                                {mappingMode === 'visual' ? (
                                    <div className="p-3">
                                        <MappingEditor
                                            mappings={safeParse(formData.mappings)}
                                            onChange={(newMappings) => setFormData({ ...formData, mappings: JSON.stringify(newMappings, null, 2) })}
                                        />
                                    </div>
                                ) : (
                                    <JsonEditor
                                        value={formData.mappings}
                                        onChange={(val) => setFormData({ ...formData, mappings: val })}
                                        minHeight="200px"
                                        maxHeight="350px"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Bottom spacer */}
                        <div className="h-8" />
                    </div>
                )}


                {activeTab === 'test' && (
                    <div className="space-y-5">
                        {!provider ? (
                            <div className="relative overflow-hidden rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/10 via-orange-500/5 to-transparent p-5">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                                        <AlertCircle className="w-6 h-6 text-yellow-400" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-yellow-300">Provider Not Saved</h4>
                                        <p className="text-xs text-white/50">Please save the provider configuration before testing API connectivity.</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Header Card with Run All Button */}
                                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-purple-500/10">
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(6,182,212,0.15),transparent_50%)]" />
                                    <div className="relative p-4 md:p-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
                                                    <Play className="w-6 h-6 text-white" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-base font-bold text-white mb-1">API Test Console</h4>
                                                    <p className="text-xs text-white/50">Test your provider's API endpoints and verify configurations</p>
                                                </div>
                                            </div>
                                            {/* Run All Button - Moved to Header */}
                                            <button
                                                onClick={async () => {
                                                    // 1. Basic Info
                                                    await runTest('getBalance')
                                                    const cRes = await runTest('getCountries')
                                                    const country = cRes?.parsed?.first?.[0]?.iso || cRes?.parsed?.first?.[0]?.id || 'us'

                                                    // 2. Services & Prices
                                                    const sRes = await runTest('getServices', { country })
                                                    const service = sRes?.parsed?.first?.[0]?.slug || sRes?.parsed?.first?.[0]?.id || 'wa'

                                                    await runTest('getPrices', { country, service })

                                                    // 3. Lifecycle Test Loop
                                                    const buyRes = await runTest('getNumber', { country, service })
                                                    const id = buyRes?.parsed?.activationId || buyRes?.parsed?.id

                                                    if (id) {
                                                        // Check status twice to simulate polling?
                                                        await runTest('getStatus', { id })

                                                        // Cancel immediately to refund
                                                        await runTest('cancelNumber', { id })
                                                    }
                                                }}
                                                disabled={isTesting}
                                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20 shrink-0"
                                            >
                                                {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                                <span className="hidden md:inline">Run All Tests</span>
                                                <span className="md:hidden">Run All</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* NEW: Unified Test Console */}
                                <div className="p-5 bg-white/[0.02] rounded-2xl border border-white/10">
                                    {/* Stepper Header */}
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            {[
                                                { key: 'getBalance', label: 'Balance', icon: Wallet, color: 'emerald' },
                                                { key: 'getCountries', label: 'Countries', icon: Globe, color: 'blue' },
                                                { key: 'getServices', label: 'Services', icon: Smartphone, color: 'purple' },
                                                { key: 'getPrices', label: 'Prices', icon: DollarSign, color: 'amber' },
                                                { key: 'getNumber', label: 'Purchase', icon: Phone, color: 'cyan' },
                                                { key: 'getStatus', label: 'Status', icon: Eye, color: 'pink' },
                                                { key: 'cancelNumber', label: 'Refund', icon: XCircle, color: 'red' },
                                            ].map((step, idx, arr) => {
                                                const isActive = testAction === step.key
                                                const hasResult = testResults?.[step.key]
                                                const isSuccess = hasResult?.success
                                                const colorMap: Record<string, string> = {
                                                    emerald: isActive ? 'ring-emerald-500 bg-emerald-500/20 text-emerald-400' : hasResult ? (isSuccess ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400') : 'bg-white/5 text-white/40',
                                                    blue: isActive ? 'ring-blue-500 bg-blue-500/20 text-blue-400' : hasResult ? (isSuccess ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400') : 'bg-white/5 text-white/40',
                                                    purple: isActive ? 'ring-purple-500 bg-purple-500/20 text-purple-400' : hasResult ? (isSuccess ? 'bg-purple-500/20 text-purple-400' : 'bg-red-500/20 text-red-400') : 'bg-white/5 text-white/40',
                                                    amber: isActive ? 'ring-amber-500 bg-amber-500/20 text-amber-400' : hasResult ? (isSuccess ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400') : 'bg-white/5 text-white/40',
                                                    cyan: isActive ? 'ring-cyan-500 bg-cyan-500/20 text-cyan-400' : hasResult ? (isSuccess ? 'bg-cyan-500/20 text-cyan-400' : 'bg-red-500/20 text-red-400') : 'bg-white/5 text-white/40',
                                                    pink: isActive ? 'ring-pink-500 bg-pink-500/20 text-pink-400' : hasResult ? (isSuccess ? 'bg-pink-500/20 text-pink-400' : 'bg-red-500/20 text-red-400') : 'bg-white/5 text-white/40',
                                                    red: isActive ? 'ring-red-500 bg-red-500/20 text-red-400' : hasResult ? (isSuccess ? 'bg-red-500/20 text-red-400' : 'bg-red-500/20 text-red-400') : 'bg-white/5 text-white/40',
                                                }
                                                return (
                                                    <div key={step.key} className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => runTest(step.key)}
                                                            className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all ${colorMap[step.color]} ${isActive ? 'ring-2 ring-offset-2 ring-offset-[#0a0a0c]' : ''}`}
                                                        >
                                                            {isTesting && testAction === step.key ? (
                                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                            ) : hasResult ? (
                                                                isSuccess ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />
                                                            ) : (
                                                                <step.icon className="w-4 h-4" />
                                                            )}
                                                        </button>
                                                        <span className={`text-xs font-medium hidden md:block ${isActive ? 'text-white' : 'text-white/40'}`}>{step.label}</span>
                                                        {idx < arr.length - 1 && (
                                                            <div className={`w-8 h-[2px] hidden md:block ${hasResult && isSuccess ? 'bg-gradient-to-r from-current to-white/10' : 'bg-white/10'}`} />
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>

                                    {/* Results Table with Foldable Response Parser */}
                                    <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20">
                                        {/* Table Header */}
                                        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                                            <div className="col-span-5">Test Endpoint</div>
                                            <div className="col-span-2 text-center">Status</div>
                                            <div className="col-span-3">Result</div>
                                            <div className="col-span-2 text-right">Time</div>
                                        </div>

                                        {[
                                            { key: 'getBalance', label: 'Check Balance', icon: Wallet, color: 'emerald', borderColor: 'border-l-emerald-500' },
                                            { key: 'getCountries', label: 'Fetch Countries', icon: Globe, color: 'blue', borderColor: 'border-l-blue-500' },
                                            { key: 'getServices', label: 'Fetch Services', icon: Smartphone, color: 'purple', borderColor: 'border-l-purple-500' },
                                            { key: 'getPrices', label: 'Check Prices', icon: DollarSign, color: 'amber', borderColor: 'border-l-amber-500' },
                                            // Lifecycle Actions
                                            { key: 'getNumber', label: 'Buy Number', icon: Phone, color: 'cyan', borderColor: 'border-l-cyan-500' },
                                            { key: 'getStatus', label: 'Get Status', icon: Eye, color: 'pink', borderColor: 'border-l-pink-500' },
                                            { key: 'setStatus', label: 'Set Status', icon: Settings, color: 'orange', borderColor: 'border-l-orange-500' },
                                            { key: 'cancelNumber', label: 'Cancel Number', icon: XCircle, color: 'red', borderColor: 'border-l-red-500' },
                                        ].map((row) => {
                                            const result = testResults?.[row.key]
                                            const isRunning = isTesting && testAction === row.key
                                            const isExpanded = expandedTest === row.key

                                            // Safer Color Mapping for Tailwind
                                            const colors = {
                                                emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
                                                blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
                                                purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
                                                amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
                                                cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
                                                pink: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' },
                                                orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
                                                red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
                                            }[row.color as keyof typeof colors] || { bg: 'bg-white/5', text: 'text-white', border: 'border-white/10' }

                                            const configFields = {
                                                getNumber: [
                                                    { key: 'country', label: 'Country', required: true, placeholder: 'us' },
                                                    { key: 'service', label: 'Service', required: true, placeholder: 'wa' },
                                                    { key: 'operator', label: 'Operator', required: false, placeholder: 'any' },
                                                    { key: 'maxPrice', label: 'Max Price', required: false, placeholder: '5.00', type: 'number' }
                                                ],
                                                getServices: [{ key: 'country', label: 'Country', required: false, placeholder: 'us (optional)' }],
                                                getPrices: [
                                                    { key: 'country', label: 'Country', required: true, placeholder: 'us' },
                                                    { key: 'service', label: 'Service', required: false, placeholder: 'wa' }
                                                ],
                                                getStatus: [{ key: 'id', label: 'Activation ID', required: true, placeholder: 'ID' }],
                                                setStatus: [
                                                    { key: 'id', label: 'Activation ID', required: true, placeholder: 'ID' },
                                                    { key: 'status', label: 'Status', required: true, type: 'select', options: [{ value: '6', label: 'Complete (6)' }, { value: '8', label: 'Cancel (8)' }, { value: '3', label: 'Retry (3)' }, { value: '1', label: 'Ready (1)' }] }
                                                ],
                                                cancelNumber: [{ key: 'id', label: 'Activation ID', required: true, placeholder: 'ID' }]
                                            }[row.key as keyof typeof configFields]

                                            return (
                                                <div key={row.key} className="border-b border-white/5 last:border-0">
                                                    {/* Main Row */}
                                                    <div
                                                        onClick={() => setExpandedTest(isExpanded ? null : row.key)}
                                                        className={`grid grid-cols-12 gap-2 px-4 py-3 border-l-4 ${row.borderColor} hover:bg-white/5 cursor-pointer transition-all ${isRunning || isExpanded ? 'bg-white/5' : ''}`}
                                                    >
                                                        {/* Test Name */}
                                                        <div className="col-span-5 flex items-center gap-3">
                                                            <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                                                                <row.icon className={`w-4 h-4 ${colors.text}`} />
                                                            </div>
                                                            <span className="text-sm font-medium text-white">{row.label}</span>
                                                            <ChevronDown className={`w-3 h-3 text-white/30 transition-transform ml-auto ${isExpanded ? 'rotate-180 text-white' : ''}`} />
                                                        </div>

                                                        {/* Status */}
                                                        <div className="col-span-2 flex items-center justify-center">
                                                            {isRunning ? (
                                                                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                                                            ) : result ? (
                                                                result.success ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-red-400" />
                                                            ) : <div className="w-2 h-2 rounded-full bg-white/20" />}
                                                        </div>

                                                        {/* Result Value */}
                                                        <div className="col-span-3 flex items-center">
                                                            {result ? (
                                                                <span className={`text-xs font-mono truncate ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                    {result.success ? (result.parsed?.balance !== undefined ? `${result.parsed.balance} ${formData.currency}` : result.parsed?.count !== undefined ? `${result.parsed.count} items` : 'Success') : (result.error || 'Failed')}
                                                                </span>
                                                            ) : <span className="text-xs text-white/20">—</span>}
                                                        </div>

                                                        {/* Response Time & Chevron */}
                                                        <div className="col-span-2 flex items-center justify-end text-[10px] font-mono text-white/40">
                                                            {result?.duration ? `${result.duration}ms` : '—'}
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="p-4 bg-white/[0.03] border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
                                                            {configFields && (
                                                                <div className="grid grid-cols-2 gap-3 mb-4">
                                                                    {configFields.map(field => (
                                                                        <div key={field.key} className="space-y-1.5">
                                                                            <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold ml-1">{field.label}</label>
                                                                            {field.type === 'select' ? (
                                                                                <select
                                                                                    value={testParams[field.key] || ''}
                                                                                    onChange={(e) => setTestParams({ ...testParams, [field.key]: e.target.value })}
                                                                                    className="w-full h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-xs text-white focus:outline-none focus:border-blue-500/50"
                                                                                >
                                                                                    {field.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                                                </select>
                                                                            ) : (
                                                                                <Input
                                                                                    placeholder={field.placeholder}
                                                                                    value={testParams[field.key] || ''}
                                                                                    onChange={(e) => setTestParams({ ...testParams, [field.key]: e.target.value })}
                                                                                    className="h-9 bg-black/40 border-white/10 text-xs text-white"
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                    <div className="col-span-2 mt-1">
                                                                        <button
                                                                            onClick={() => runTest(row.key, testParams)}
                                                                            disabled={isRunning}
                                                                            className={`w-full h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all ${colors.bg} ${colors.text} border ${colors.border} hover:opacity-80`}
                                                                        >
                                                                            {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                                                            Run {row.label}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {result && (
                                                                <div className="space-y-3">
                                                                    {/* Request URL */}
                                                                    {result.trace && (
                                                                        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                                                                            <Globe className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                                                            <div className="font-mono text-[10px] text-blue-300 break-all">{result.trace.url}</div>
                                                                        </div>
                                                                    )}

                                                                    {/* Dual Panel: Raw vs Mapped */}
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                        {/* Raw Response Panel */}
                                                                        <div className="rounded-xl border border-white/10 overflow-hidden bg-black/40">
                                                                            <div className="px-3 py-2 bg-gradient-to-r from-orange-500/20 to-transparent border-b border-white/10 flex items-center gap-2">
                                                                                <Terminal className="w-3 h-3 text-orange-400" />
                                                                                <span className="text-[10px] uppercase font-bold text-orange-400">Raw Response</span>
                                                                                <span className="text-[9px] text-white/30 ml-auto">from API</span>
                                                                            </div>
                                                                            <div className="p-3 max-h-60 overflow-auto custom-scrollbar">
                                                                                <pre className="text-[10px] font-mono leading-relaxed text-orange-300/70">
                                                                                    {result.trace?.responseBody
                                                                                        ? (typeof result.trace.responseBody === 'string'
                                                                                            ? result.trace.responseBody
                                                                                            : JSON.stringify(result.trace.responseBody, null, 2))
                                                                                        : (result.data || 'No raw response captured')}
                                                                                </pre>
                                                                            </div>
                                                                        </div>

                                                                        {/* Mapped Data Panel */}
                                                                        <div className="rounded-xl border border-white/10 overflow-hidden bg-black/40">
                                                                            <div className="px-3 py-2 bg-gradient-to-r from-emerald-500/20 to-transparent border-b border-white/10 flex items-center gap-2">
                                                                                <CheckCircle className="w-3 h-3 text-emerald-400" />
                                                                                <span className="text-[10px] uppercase font-bold text-emerald-400">Mapped Data</span>
                                                                                <span className="text-[9px] text-white/30 ml-auto">after mappings</span>
                                                                            </div>
                                                                            <div className="p-3 max-h-60 overflow-auto custom-scrollbar">
                                                                                {result.parsed ? (
                                                                                    <SyntaxHighlightedJson data={result.parsed} />
                                                                                ) : (
                                                                                    <pre className={`text-[10px] font-mono leading-relaxed ${result.success ? 'text-emerald-300/80' : 'text-red-300/80'}`}>
                                                                                        {typeof result.data === 'string'
                                                                                            ? result.data
                                                                                            : JSON.stringify(result.data || { message: 'No mapping applied' }, null, 2)}
                                                                                    </pre>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Mapping Status Indicator */}
                                                                    <div className={`flex items-center gap-2 p-2 rounded-lg border ${result.success ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                                                        {result.success ? (
                                                                            <>
                                                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                                                                <span className="text-[10px] text-emerald-300">Mapping successful - data normalized correctly</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <XCircle className="w-3.5 h-3.5 text-red-400" />
                                                                                <span className="text-[10px] text-red-300">{result.error || 'Mapping failed'}</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'ai' && (
                    <ProviderAIHub
                        currentData={formData}
                        onUpdate={(updates: any) => setFormData({ ...formData, ...updates })}
                    />
                )}
            </div>

            {/* Footer - Floating bar style on mobile, normal on desktop */}
            <div className="md:hidden fixed bottom-6 left-4 right-4 z-[105]">
                <div className="bg-[#0a0a0c]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl shadow-black/40 flex items-center justify-between gap-2">
                    {!isCreating && (
                        <button
                            onClick={handleDelete}
                            disabled={isSaving}
                            className="w-12 h-12 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className={`${isCreating ? 'flex-1' : ''} h-12 px-5 flex items-center justify-center rounded-xl bg-white/5 text-white/60 hover:bg-white/10 transition-colors`}
                    >
                        <XCircle className="w-5 h-5 mr-2" />
                        <span className="font-medium text-sm">Cancel</span>
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 h-12 flex items-center justify-center rounded-xl bg-[hsl(var(--neon-lime))] text-black font-semibold shadow-[0_0_20px_hsl(var(--neon-lime)/0.3)] transition-all hover:opacity-90"
                    >
                        {isSaving ? (
                            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                        ) : (
                            <Save className="w-5 h-5 mr-2" />
                        )}
                        <span className="text-sm">Save Changes</span>
                    </button>
                </div>
                {/* Bottom glow */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1/2 h-4 bg-[hsl(var(--neon-lime)/0.15)] blur-xl pointer-events-none" />
            </div>

            {/* Desktop Footer */}
            <div className="hidden md:flex p-4 border-t border-white/5 bg-gradient-to-t from-[#0A0A0A] to-[#0A0A0A]/95 justify-between items-center gap-4 shrink-0">
                <div>
                    {!isCreating && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20 h-10 px-4 text-sm font-medium"
                            onClick={handleDelete}
                            disabled={isSaving}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                        </Button>
                    )}
                </div>
                <div className="flex gap-3">
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-10 px-5 text-white/60 hover:bg-white/5 hover:text-white text-sm font-medium">Cancel</Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-[hsl(var(--neon-lime))] text-black hover:opacity-90 h-10 px-6 text-sm font-semibold shadow-[0_0_20px_hsl(var(--neon-lime)/0.3)]">
                        {isSaving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Changes
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}
