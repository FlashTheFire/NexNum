"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RefreshCw, Server, Search, MapPin, Smartphone, ChevronDown, ChevronRight, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PremiumSkeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { InfoTooltip, TTCode } from "@/components/ui/tooltip"

interface ProviderStatus {
    id: string
    name: string
    logoUrl?: string
    status: 'online' | 'maintenance' | 'offline'
}

interface Country {
    id: string
    externalId: string
    name: string
    phoneCode: string
    provider: string
    lastSyncedAt: string
}

interface AggregatedCountry {
    canonicalName: string
    displayName: string
    phoneCode: string
    rawNames: string[]
    variants: string[]  // Real variants like "(virtual)" or "(2)"
    variantCount: number
    providers: Array<{
        provider: string
        externalId: string
        name: string
        phoneCode: string
    }>
    lastSyncedAt: string
}

interface AggregatedService {
    canonicalName: string
    canonicalSlug: string
    codes: string[]
    providers: {
        provider: string
        externalId: string
        name: string
        code: string
        price: number
        originalPrice?: number
        count: number
        isActive: boolean
    }[]
    totalProviders: number
    bestPrice: number
    priceRange: { min: number, max: number }
}

interface Service {
    id: string
    externalId: string
    name: string
    shortName: string
    provider: string
    lastSyncedAt: string
}

// Providers are now fetched dynamically from the database
// (removed hardcoded array)

export default function InventoryPage() {
    const [syncing, setSyncing] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'countries' | 'services'>('countries')
    const [selectedProvider, setSelectedProvider] = useState('')
    const providerScrollRef = useRef<HTMLDivElement>(null)
    const [providerScrollProgress, setProviderScrollProgress] = useState(0)

    // Dynamic providers from database
    const [providers, setProviders] = useState<ProviderStatus[]>([])
    const [providersLoading, setProvidersLoading] = useState(true)

    const [data, setData] = useState<Country[] | Service[] | AggregatedCountry[] | AggregatedService[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [mode, setMode] = useState<'raw' | 'aggregated'>('aggregated')
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    // Fetch providers from database
    useEffect(() => {
        const fetchProviders = async () => {
            try {
                const res = await fetch('/api/admin/providers')
                const json = await res.json()
                // API returns array directly, not { providers: [...] }
                const providerList = Array.isArray(json) ? json : (json.providers || [])
                setProviders(providerList.map((p: any) => ({
                    id: p.name.toLowerCase(),
                    name: p.displayName || p.name,
                    logoUrl: p.logoUrl || `/providers/${p.name.toLowerCase()}.png`,
                    status: p.isActive ? 'online' : 'offline'
                })))
            } catch (e) {
                console.error('Failed to fetch providers', e)
            } finally {
                setProvidersLoading(false)
            }
        }
        fetchProviders()
    }, [])


    const fetchData = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                type: activeTab,
                page: String(page),
                q: search,
                aggregate: String(!selectedProvider),
                limit: typeof window !== 'undefined' && window.innerWidth < 768 ? '10' : '20',
                ...(selectedProvider && { provider: selectedProvider })
            })
            const res = await fetch(`/api/admin/inventory?${params}`)
            const json = await res.json()
            if (json.items) {
                setData(json.items)
                setTotalPages(json.pages)
                setTotal(json.total)
                setMode(json.mode || 'raw')
            }
        } catch {
            toast.error("Failed to load data")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const debounce = setTimeout(fetchData, 300)
        return () => clearTimeout(debounce)
    }, [activeTab, search, page, selectedProvider])

    const handleSync = async (providerId: string) => {
        setSyncing(providerId)
        try {
            const res = await fetch('/api/admin/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: providerId })
            })
            const data = await res.json()
            if (res.ok) {
                toast.success(`Synced ${providerId}: ${data.stats?.countries || 0} countries, ${data.stats?.services || 0} services`)
                fetchData()
            } else {
                toast.error(data.error || "Sync failed")
            }
        } catch {
            toast.error("Sync failed")
        } finally {
            setSyncing(null)
        }
    }

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }

    const isAggregated = mode === 'aggregated' && !selectedProvider

    return (
        <div className="min-h-screen p-4 md:p-8 pb-32 md:pb-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                    <span className="w-2 h-8 bg-purple-500 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
                    Inventory Control
                </h1>
                <p className="text-gray-400 mt-2">Manage provider Countries & Services data</p>
            </div>

            {/* Providers Grid / Slider */}
            <div className="relative group">
                <div
                    ref={providerScrollRef}
                    onScroll={(e) => {
                        const element = e.currentTarget;
                        const scrollLeft = element.scrollLeft;
                        const maxScroll = element.scrollWidth - element.clientWidth;
                        setProviderScrollProgress(Math.min(Math.max(scrollLeft / maxScroll, 0), 1));
                    }}
                    className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-8 md:pb-0 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 scrollbar-hide"
                >
                    {providers.map((p, i) => (
                        <motion.div
                            key={p.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`min-w-[160px] md:min-w-0 snap-start bg-[#111318]/60 border rounded-xl p-4 relative overflow-hidden group transition-all cursor-pointer ${selectedProvider === p.id ? 'border-[hsl(var(--neon-lime))]' : 'border-white/5 hover:border-white/10'
                                }`}
                            onClick={() => setSelectedProvider(selectedProvider === p.id ? '' : p.id)}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-white/20 transition-colors">
                                        {p.logoUrl ? (
                                            <img src={p.logoUrl} alt={p.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                        ) : (
                                            <Server size={18} className="text-gray-600" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-white truncate">{p.name}</h4>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <div className={`w-1 h-1 rounded-full ${p.status === 'online' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-yellow-500'}`} />
                                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-tighter">{p.status}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 rounded-lg hover:bg-white/10 group/btn"
                                        onClick={(e) => { e.stopPropagation(); handleSync(p.id); }}
                                        disabled={!!syncing}
                                    >
                                        <RefreshCw size={13} className={syncing === p.id ? "animate-spin text-[hsl(var(--neon-lime))]" : "text-gray-500 group-hover/btn:text-white transition-colors"} />
                                    </Button>
                                </div>
                            </div>

                            {/* Selection Glow */}
                            {selectedProvider === p.id && (
                                <div className="absolute top-0 right-0 p-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))] shadow-[0_0_10px_hsl(var(--neon-lime))]" />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>

                {/* Mobile Dots */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 md:hidden">
                    {[0, 1, 2].map((dotIndex) => {
                        const isActive =
                            (dotIndex === 0 && providerScrollProgress < 0.33) ||
                            (dotIndex === 1 && providerScrollProgress >= 0.33 && providerScrollProgress < 0.66) ||
                            (dotIndex === 2 && providerScrollProgress >= 0.66);

                        return (
                            <motion.div
                                key={dotIndex}
                                layout
                                initial={false}
                                animate={{
                                    width: isActive ? 16 : 6,
                                    backgroundColor: isActive ? 'hsl(var(--neon-lime))' : 'rgba(255,255,255,0.1)'
                                }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="h-1.5 rounded-full"
                            />
                        )
                    })}
                </div>
            </div>

            {/* Data Table Section */}
            <div className="bg-[#111318]/60 border border-white/5 rounded-2xl">
                {/* Tabs & Search */}
                <div className="p-2 border-b border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sticky top-16 md:top-0 z-30 bg-[#111318] backdrop-blur-xl rounded-t-2xl">
                    <div className="flex gap-2 items-center w-full md:w-auto">
                        <Button
                            variant={activeTab === 'countries' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => { setActiveTab('countries'); setPage(1); }}
                            className={activeTab === 'countries' ? 'bg-[hsl(var(--neon-lime))] text-black' : ''}
                        >
                            <MapPin size={14} className="mr-1" /> Countries
                        </Button>
                        <Button
                            variant={activeTab === 'services' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => { setActiveTab('services'); setPage(1); }}
                            className={activeTab === 'services' ? 'bg-[hsl(var(--neon-lime))] text-black' : ''}
                        >
                            <Smartphone size={14} className="mr-1" /> Services
                        </Button>

                        {/* Moved Smart View Here */}
                        {isAggregated && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/40 ml-auto md:ml-4">
                                <Layers size={12} className="text-purple-400" />
                                <span className="text-[10px] text-purple-400 uppercase tracking-wider">Smart View</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                                placeholder={`Search ${activeTab}...`}
                                className="pl-9 bg-black/20 border-white/10 text-sm h-9"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            />
                        </div>
                        {/* Moved Total Count Here */}
                        <span className="text-xs text-gray-500 whitespace-nowrap">{total} items</span>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-white/5 text-gray-300 font-medium">
                            <tr>
                                {activeTab === 'countries' ? (
                                    isAggregated ? (
                                        <>
                                            <th colSpan={5} className="p-0 border-0">
                                                <div className="flex items-center px-6 py-3 text-left">
                                                    <div className="w-8"></div>
                                                    <div className="flex-1 font-medium min-w-[200px] pr-8">Name</div>
                                                    <div className="w-32 font-medium">Phone Code</div>
                                                    <div className="w-40 font-medium">Providers</div>
                                                    <div className="w-32 font-medium text-right">Last Synced</div>
                                                </div>
                                            </th>
                                        </>
                                    ) : (
                                        <th colSpan={5} className="p-0 border-0">
                                            <div className="flex items-center px-6 py-3 text-left">
                                                <div className="flex-1 font-medium">Name</div>
                                                <div className="w-32 font-medium">Phone Code</div>
                                                <div className="w-40 font-medium">Provider</div>
                                                <div className="w-40 font-medium">External ID</div>
                                                <div className="w-32 font-medium text-right">Synced</div>
                                            </div>
                                        </th>
                                    )
                                ) : (
                                    isAggregated ? (
                                        <th colSpan={5} className="p-0 border-0">
                                            <div className="flex items-center px-6 py-3 text-left">
                                                <div className="w-8"></div>
                                                <div className="flex-1 font-medium min-w-[200px] pr-8">Service Name</div>
                                                <div className="w-40 font-medium">Best Price</div>
                                                <div className="w-40 font-medium">Providers</div>
                                                <div className="w-64 font-medium text-right px-2">Codes</div>
                                            </div>
                                        </th>
                                    ) : (
                                        <th colSpan={5} className="p-0 border-0">
                                            <div className="flex items-center px-6 py-3 text-left">
                                                <div className="flex-1 font-medium">Name</div>
                                                <div className="w-32 font-medium">Code</div>
                                                <div className="w-40 font-medium">Provider</div>
                                                <div className="w-32 font-medium text-right">Synced</div>
                                            </div>
                                        </th>
                                    )
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                [1, 2, 3, 4, 5].map((key) => (
                                    <tr key={key}>
                                        <td colSpan={5} className="px-6 py-4">
                                            <PremiumSkeleton className="h-6 w-full opacity-50" />
                                        </td>
                                    </tr>
                                ))
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-600">
                                        No data found. Try syncing a provider.
                                    </td>
                                </tr>
                            ) : activeTab === 'countries' && isAggregated ? (
                                // Aggregated Countries View
                                (data as AggregatedCountry[]).map((item) => {
                                    const isExpanded = expandedRows.has(item.canonicalName)
                                    return (
                                        <motion.tr
                                            key={item.canonicalName}
                                            layout
                                            className="hover:bg-white/[0.02] transition-colors"
                                        >
                                            <td colSpan={5} className="p-0">
                                                {/* Main Row */}
                                                <div
                                                    className="flex items-center cursor-pointer hover:bg-white/[0.03] px-6 py-3"
                                                    onClick={() => toggleRow(item.canonicalName)}
                                                >
                                                    <div className="w-8">
                                                        {item.providers.length > 1 ? (
                                                            isExpanded ? (
                                                                <ChevronDown size={14} className="text-gray-500" />
                                                            ) : (
                                                                <ChevronRight size={14} className="text-gray-500" />
                                                            )
                                                        ) : null}
                                                    </div>
                                                    <div className="flex-1 font-medium text-white min-w-[200px] pr-8">
                                                        {item.displayName}
                                                        {item.variantCount > 0 && (
                                                            <span className="ml-2 text-[10px] text-gray-500">
                                                                ({item.variantCount} variant{item.variantCount > 1 ? 's' : ''})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="w-32 text-blue-300">
                                                        {item.phoneCode ? `+${item.phoneCode}` : <span className="text-gray-600">-</span>}
                                                    </div>
                                                    <div className="w-40 flex items-center gap-1">
                                                        <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-medium">
                                                            {item.providers.length} provider{item.providers.length > 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                    <div className="w-32 text-right text-xs text-gray-600">
                                                        {item.lastSyncedAt && formatDistanceToNow(new Date(item.lastSyncedAt))} ago
                                                    </div>
                                                </div>

                                                {/* Expanded Provider Details */}
                                                <AnimatePresence>
                                                    {isExpanded && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            className="bg-black/20 border-t border-white/5 overflow-hidden"
                                                        >
                                                            {item.providers.map((p, idx) => (
                                                                <div
                                                                    key={`${p.provider}-${p.externalId}`}
                                                                    className="flex items-center px-6 py-2 border-b border-white/5 last:border-0"
                                                                >
                                                                    <div className="w-8"></div>
                                                                    <div className="flex-1 text-gray-400 text-sm pl-4">
                                                                        {p.name}
                                                                    </div>
                                                                    <div className="w-32 text-gray-500 text-sm">
                                                                        {p.phoneCode ? `+${p.phoneCode.replace(/[^0-9]/g, '')}` : '-'}
                                                                    </div>
                                                                    <div className="w-40">
                                                                        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 uppercase text-[10px] tracking-wider">
                                                                            {p.provider}
                                                                        </span>
                                                                    </div>
                                                                    <div className="w-32 text-right text-xs text-gray-600 font-mono">
                                                                        {p.externalId}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </td>
                                        </motion.tr>
                                    )
                                })
                            ) : activeTab === 'countries' ? (
                                // Raw Countries View
                                (data as Country[]).map((item, index) => (
                                    <tr key={`${item.id}-${index}`} className="hover:bg-white/[0.02] transition-colors">
                                        <td colSpan={5} className="p-0 border-0">
                                            <div className="flex items-center px-6 py-3 text-left">
                                                <div className="flex-1 font-medium text-white min-w-[200px] pr-8">{item.name}</div>
                                                <div className="w-32 text-blue-300">
                                                    {item.phoneCode ? `+${item.phoneCode}` : <span className="text-gray-600">-</span>}
                                                </div>
                                                <div className="w-40">
                                                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 uppercase text-[10px] tracking-wider">
                                                        {item.provider}
                                                    </span>
                                                </div>
                                                <div className="w-40 text-gray-500 font-mono text-xs">{item.externalId}</div>
                                                <div className="w-32 text-right text-xs text-gray-600">
                                                    {item.lastSyncedAt && formatDistanceToNow(new Date(item.lastSyncedAt))} ago
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : activeTab === 'services' && isAggregated ? (
                                // Aggregated Services View
                                (data as AggregatedService[]).map((item) => {
                                    const isExpanded = expandedRows.has(item.canonicalName)
                                    return (
                                        <motion.tr
                                            key={item.canonicalName}
                                            layout
                                            className="hover:bg-white/[0.02] transition-colors"
                                        >
                                            <td colSpan={5} className="p-0">
                                                {/* Main Row */}
                                                <div
                                                    className="flex items-center cursor-pointer hover:bg-white/[0.03] px-6 py-3"
                                                    onClick={() => toggleRow(item.canonicalName)}
                                                >
                                                    <div className="w-8">
                                                        {item.providers.length > 1 ? (
                                                            isExpanded ? (
                                                                <ChevronDown size={14} className="text-gray-500" />
                                                            ) : (
                                                                <ChevronRight size={14} className="text-gray-500" />
                                                            )
                                                        ) : null}
                                                    </div>
                                                    <div className="flex-1 font-medium text-white flex items-center gap-2 min-w-[200px] pr-8">
                                                        {item.canonicalName}
                                                        {item.providers.length > 1 && (
                                                            <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                                                                {item.codes?.length || 0} codes
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="w-40 text-emerald-400 font-mono">
                                                        {item.bestPrice > 0 ? (
                                                            <>
                                                                <span className="text-gray-500 text-xs mr-1">from</span>
                                                                {item.bestPrice.toFixed(2)}₽
                                                            </>
                                                        ) : (
                                                            <span className="text-gray-600">-</span>
                                                        )}
                                                    </div>
                                                    <div className="w-40 flex items-center gap-1">
                                                        <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-medium">
                                                            {item.providers.length} provider{item.providers.length > 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                    <div className="w-64 text-right text-xs text-gray-500 font-mono truncate px-2">
                                                        {item.codes?.join(', ') || ''}
                                                    </div>
                                                </div>

                                                {/* Expanded Provider Details */}
                                                <AnimatePresence>
                                                    {isExpanded && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            className="bg-black/20 border-t border-white/5 overflow-hidden"
                                                        >
                                                            {item.providers.map((p, idx) => (
                                                                <div
                                                                    key={`${p.provider}-${p.externalId}`}
                                                                    className="flex items-center px-6 py-2 border-b border-white/5 last:border-0"
                                                                >
                                                                    <div className="w-8"></div>
                                                                    <div className="flex-1 text-gray-400 text-sm pl-4 flex items-center gap-2">
                                                                        {p.name}
                                                                        {!p.isActive && <span className="text-[10px] text-red-500 bg-red-500/10 px-1 rounded">OFFLINE</span>}
                                                                    </div>
                                                                    <div className="w-40 text-gray-400 text-sm font-mono">
                                                                        {p.price > 0 ? `${p.price}₽` : '-'}
                                                                    </div>
                                                                    <div className="w-40">
                                                                        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 uppercase text-[10px] tracking-wider">
                                                                            {p.provider}
                                                                        </span>
                                                                    </div>
                                                                    <div className="w-64 text-right text-xs text-gray-600 font-mono">
                                                                        {p.code}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </td>
                                        </motion.tr>
                                    )
                                })
                            ) : (
                                // Services View
                                (data as Service[]).map((item, index) => (
                                    <tr key={`${item.id}-${item.provider}-${index}`} className="hover:bg-white/[0.02] transition-colors">
                                        <td colSpan={5} className="p-0 border-0">
                                            <div className="flex items-center px-6 py-3 text-left">
                                                <div className="flex-1 font-medium text-white min-w-[200px] pr-8">{item.name}</div>
                                                <div className="w-32 text-blue-300 font-mono">{item.shortName}</div>
                                                <div className="w-40">
                                                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 uppercase text-[10px] tracking-wider">
                                                        {item.provider}
                                                    </span>
                                                </div>
                                                <div className="w-32 text-right text-xs text-gray-600">
                                                    {item.lastSyncedAt && formatDistanceToNow(new Date(item.lastSyncedAt))} ago
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* MOBILE VIEW CARD LAYOUT */}
                <div className="hidden space-y-4 p-4 pb-32"> {/* Added pb-32 for Floating Bar clearance */}
                    {loading ? (
                        [...Array(3)].map((_, i) => (
                            <PremiumSkeleton key={i} className="h-32 w-full rounded-2xl" />
                        ))
                    ) : data.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">No results found</div>
                    ) : (
                        activeTab === 'services' && isAggregated ? (
                            (data as AggregatedService[]).map((item) => {
                                const isExpanded = expandedRows.has(item.canonicalName)
                                return (
                                    <motion.div
                                        key={item.canonicalName}
                                        layout
                                        className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm"
                                    >
                                        <div
                                            className="p-4 flex flex-col gap-3"
                                            onClick={() => toggleRow(item.canonicalName)}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-lg font-medium text-white">{item.canonicalName}</h3>
                                                    <div className="flex gap-2 mt-1">
                                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-medium">
                                                            {item.providers.length} Providers
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-full bg-white/5 text-gray-400 text-[10px]">
                                                            {item.codes?.length || 0} Codes
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {item.bestPrice > 0 ? (
                                                        <div className="text-xl font-mono text-emerald-400 font-semibold">{item.bestPrice.toFixed(2)}₽</div>
                                                    ) : (
                                                        <div className="text-gray-600 font-mono text-lg">-</div>
                                                    )}
                                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Best Price</div>
                                                </div>
                                            </div>

                                            {/* Preview Codes */}
                                            <div className="text-xs text-gray-500 font-mono truncate border-t border-white/5 pt-2">
                                                {item.codes?.join(', ') || ''}
                                            </div>

                                            {/* Expand Button */}
                                            <div className="flex justify-center pt-1">
                                                {isExpanded ? <ChevronDown size={16} className="text-gray-600" /> : <ChevronDown size={16} className="text-gray-600 opacity-50" />}
                                            </div>
                                        </div>

                                        {/* Expanded Details */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0 }}
                                                    animate={{ height: "auto" }}
                                                    exit={{ height: 0 }}
                                                    className="bg-black/20 border-t border-white/5"
                                                >
                                                    {item.providers.map((p, idx) => (
                                                        <div key={`${p.provider}-${idx}`} className="p-3 border-b border-white/5 last:border-0 flex justify-between items-center">
                                                            <div>
                                                                <div className="text-sm text-gray-300">{p.name}</div>
                                                                <div className="text-[10px] text-gray-500 font-mono mt-0.5">{p.code}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="font-mono text-emerald-400/80 text-sm">{p.price > 0 ? `${p.price}₽` : '-'}</div>
                                                                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 uppercase text-[9px] tracking-wider text-gray-500 mt-1 inline-block">
                                                                    {p.provider}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            })
                        ) : (
                            <div className="text-center text-gray-500">Mobile view for Countries/Raw coming soon...</div>
                        )
                    )}
                </div>

                {/* Pagination */}
                <div className="p-4 border-t border-white/5 flex justify-center gap-2">
                    <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                        Previous
                    </Button>
                    <span className="px-4 py-2 text-sm text-gray-500">Page {page} of {totalPages}</span>
                    <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        Next
                    </Button>
                </div>
            </div>
        </div >
    )
}
