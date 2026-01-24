"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RefreshCw, Server, Search, MapPin, Smartphone, ChevronDown, ChevronRight, Layers, Eye, EyeOff, Trash2, Edit, MoreHorizontal, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { PremiumSkeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { InfoTooltip, TTCode } from "@/components/ui/tooltip"
import { useTranslations } from "next-intl"
import { InventoryEditModal } from "@/components/admin/InventoryEditModal"
import { DeleteConfirmDialog } from "@/components/admin/DeleteConfirmDialog"
import { InventoryStatsHeader } from "@/components/admin/InventoryStatsHeader"
import { InventoryTable, InventoryItem } from "@/components/admin/InventoryTable"
import * as UnifiedInventory from "@/lib/admin/unified-inventory"
import { useInventoryActions } from "@/hooks/admin/useInventoryActions"
import { useMemo } from "react"

interface ProviderStatus {
    id: string
    name: string
    slug: string
    logoUrl?: string
    status: 'online' | 'maintenance' | 'offline'
}

interface Country {
    id: string
    externalId: string
    name: string
    provider: string
    lastSyncedAt: string
}

interface AggregatedCountry {
    countryCode: string
    canonicalName: string
    displayName: string
    flagUrl: string
    providers: Array<{
        provider: string
        externalId: string
        stock: number
        minPrice: number
        maxPrice: number
        isActive?: boolean
    }>
    totalProviders: number
    serviceCount: number
    totalStock: number
    priceRange: { min: number; max: number }
    lastSyncedAt: number
}

interface AggregatedService {
    canonicalName: string
    canonicalSlug: string
    providers: Array<{
        provider: string
        externalId: string
        stock: number
        minPrice: number
        maxPrice: number
        isActive?: boolean
    }>
    totalProviders: number
    countryCount: number
    totalStock: number
    bestPrice: number
    priceRange: { min: number; max: number }
    lastSyncedAt: number
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
    const t = useTranslations("admin.inventory")
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

    // Bulk selection and action states
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [showHidden, setShowHidden] = useState(false)

    // Edit modal state
    const [editModal, setEditModal] = useState<{
        isOpen: boolean
        type: 'country' | 'service'
        providerId: string
        providerDisplayName: string
        externalId: string
        currentData: { name: string; flagUrl?: string; iconUrl?: string }
    } | null>(null)

    // Delete dialog state
    const [deleteDialog, setDeleteDialog] = useState<{
        isOpen: boolean
        type: 'country' | 'service'
        providerId: string
        externalId: string
        itemName: string
    } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)

    // Open edit modal helper
    const openEditModal = (type: 'country' | 'service', provider: string, externalId: string, name: string, imageUrl?: string) => {
        const providerData = providers.find(p => p.slug.toLowerCase() === provider.toLowerCase())
        setEditModal({
            isOpen: true,
            type,
            providerId: provider,
            providerDisplayName: providerData?.name || provider,
            externalId,
            currentData: {
                name,
                ...(type === 'country' ? { flagUrl: imageUrl } : { iconUrl: imageUrl })
            }
        })
    }

    // Open delete dialog helper
    const openDeleteDialog = (type: 'country' | 'service', provider: string, externalId: string, name: string) => {
        setDeleteDialog({
            isOpen: true,
            type,
            providerId: provider,
            externalId,
            itemName: `${name} (${provider})`
        })
    }

    // Handle delete confirmation
    const handleDeleteConfirm = async (permanent: boolean) => {
        if (!deleteDialog) return
        setDeleteLoading(true)
        try {
            const endpoint = deleteDialog.type === 'country'
                ? '/api/admin/inventory/countries'
                : '/api/admin/inventory/services'
            const res = await fetch(endpoint, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId: deleteDialog.providerId,
                    externalId: deleteDialog.externalId,
                    permanent
                })
            })
            const data = await res.json()
            if (res.ok && data.success) {
                toast.success(data.message || 'Deleted successfully')
                fetchData()
            } else {
                toast.error(data.error || 'Delete failed')
            }
        } catch {
            toast.error('Delete failed')
        } finally {
            setDeleteLoading(false)
            setDeleteDialog(null)
        }
    }

    // Get provider ID from slug
    const getProviderId = (providerSlug: string) => {
        // Find provider by matching slug to provider name
        const provider = providers.find(p => p.slug.toLowerCase() === providerSlug.toLowerCase())
        return provider?.id || providerSlug
    }

    // Bulk action handler
    const handleBulkAction = async (action: 'hide' | 'unhide' | 'delete') => {
        if (selectedItems.size === 0) {
            toast.warning('No items selected')
            return
        }

        const items = Array.from(selectedItems).map(key => {
            const [provider, externalId] = key.split('::')
            return { providerId: getProviderId(provider), externalId }
        })

        setActionLoading('bulk')
        try {
            const res = await fetch('/api/admin/inventory/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: activeTab,
                    action,
                    items,
                    permanent: true
                })
            })
            const data = await res.json()

            if (res.ok) {
                toast.success(data.message)
                setSelectedItems(new Set())
                fetchData()
            } else {
                toast.error(data.error || 'Bulk action failed')
            }
        } catch {
            toast.error('Bulk action failed')
        } finally {
            setActionLoading(null)
        }
    }

    // Toggle item selection
    const toggleSelection = (provider: string, externalId: string) => {
        const key = `${provider}::${externalId}`
        setSelectedItems(prev => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }

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
                    slug: p.name,
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
    // Reset page when changing tab or provider
    useEffect(() => {
        setPage(1)
        setExpandedRows(new Set())
    }, [activeTab, selectedProvider])

    const fetchData = async () => {
        setLoading(true)
        try {
            const currentLimit = typeof window !== 'undefined' && window.innerWidth < 768 ? 10 : 20
            const params = new URLSearchParams({
                type: activeTab,
                page: String(page),
                q: search,
                aggregate: 'true',
                limit: String(currentLimit),
            })
            if (selectedProvider) {
                params.set('provider', selectedProvider)
            }
            if (showHidden) {
                params.set('includeHidden', 'true')
            }
            const res = await fetch(`/api/admin/inventory?${params}`)
            const json = await res.json()
            if (json.items) {
                setData(json.items)
                setTotalPages(json.pages || 1)
                setTotal(json.total || 0)
                setMode(json.mode || 'raw')
            } else {
                setData([])
                setTotalPages(1)
                setTotal(0)
            }
        } catch (err) {
            console.error('Inventory fetch error:', err)
            toast.error("Failed to load data")
            setData([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const debounce = setTimeout(fetchData, 300)
        return () => clearTimeout(debounce)
    }, [activeTab, search, page, selectedProvider, showHidden])

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

    const isAggregated = mode === 'aggregated'

    // Unified Actions Hook
    const { toggleVisibility, loadingId } = useInventoryActions({ onSuccess: fetchData })

    // Map data to Unified Inventory Items
    const mappedItems: InventoryItem[] = useMemo(() => {
        if (!data) return []

        // Helper to get providers list safely
        const getProviders = (item: any) => {
            if (item.providers && Array.isArray(item.providers)) return item.providers
            return [{
                provider: item.provider,
                externalId: item.externalId,
                stock: item.stock || 0,
                minPrice: item.minPrice || item.priceRange?.min || 0,
                maxPrice: item.maxPrice || item.priceRange?.max || 0,
                isActive: item.isActive
            }]
        }

        return (data as any[]).map(item => {
            const providers = getProviders(item)
            // Use the first provider for identity in aggregated view if needed
            const primaryProvider = providers[0] || {}

            // Determine type safely
            const type = activeTab === 'countries' ? 'country' : 'service' as const

            return {
                id: `${item.provider || item.countryCode || item.canonicalSlug}:${item.externalId || item.countryCode || item.canonicalSlug}`,
                provider: item.provider || primaryProvider.provider || 'mixed',
                externalId: item.externalId || primaryProvider.externalId || item.countryCode || item.canonicalSlug || 'unknown',
                name: item.name || item.displayName || item.canonicalName || 'Unknown',
                type: type,
                iconUrl: item.iconUrl || item.flagUrl,
                stock: item.stock || item.totalStock || 0,
                priceRange: item.priceRange || { min: 0, max: 0 },
                isActive: item.isActive !== false,
                lastSyncedAt: item.lastSyncedAt,
                providersCount: item.totalProviders || 1
            } as InventoryItem
        })
    }, [data, activeTab])

    return (
        <div className="min-h-screen p-4 md:p-8 pb-32 md:pb-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                    <span className="w-2 h-8 bg-purple-500 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
                    {t('title')}
                </h1>
                <p className="text-gray-400 mt-2">{t('subtitle')}</p>
            </div>

            {/* Stats Overview */}
            <InventoryStatsHeader
                onSyncAll={async () => {
                    for (const p of providers) {
                        await handleSync(p.id)
                    }
                }}
                syncing={syncing !== null}
            />

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
                                        <code className="text-[9px] text-gray-500 font-mono">@{p.slug}</code>
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
                            <MapPin size={14} className="mr-1" /> {t('tabs.countries')}
                        </Button>
                        <Button
                            variant={activeTab === 'services' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => { setActiveTab('services'); setPage(1); }}
                            className={activeTab === 'services' ? 'bg-[hsl(var(--neon-lime))] text-black' : ''}
                        >
                            <Smartphone size={14} className="mr-1" /> {t('tabs.services')}
                        </Button>

                        {/* Moved Smart View Here */}
                        {isAggregated && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/40 ml-auto md:ml-4">
                                <Layers size={12} className="text-purple-400" />
                                <span className="text-[10px] text-purple-400 uppercase tracking-wider">{t('actions.smartView')}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                                placeholder={t('actions.search', { tab: activeTab })}
                                className="pl-9 bg-black/20 border-white/10 text-sm h-9"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            />
                        </div>

                        {/* Show Hidden Toggle */}
                        {/* Show Hidden Toggle Switch */}
                        <div className="flex items-center gap-2 h-9 border border-white/10 rounded-md px-3 bg-white/5 mx-2">
                            <Switch
                                id="show-hidden"
                                checked={showHidden}
                                onCheckedChange={setShowHidden}
                                className="data-[state=checked]:bg-orange-500 scale-90"
                            />
                            <Label htmlFor="show-hidden" className="text-xs text-gray-400 font-medium cursor-pointer select-none">
                                {showHidden ? 'Showing Hidden' : 'Show Hidden'}
                            </Label>
                        </div>

                        {/* Moved Total Count Here */}
                        <span className="text-xs text-gray-500 whitespace-nowrap">{total} {t('table.items')}</span>
                    </div>
                </div>

                {/* Bulk Action Bar */}
                <AnimatePresence>
                    {selectedItems.size > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-[hsl(var(--neon-lime))]/10 border-y border-[hsl(var(--neon-lime))]/20 px-6 py-2 flex items-center justify-between"
                        >
                            <span className="text-sm text-[hsl(var(--neon-lime))] font-medium">
                                {selectedItems.size} items selected
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime))]/10"
                                    onClick={() => handleBulkAction('unhide')}
                                    disabled={actionLoading === 'bulk'}
                                >
                                    <Eye size={14} className="mr-1.5" /> Unhide
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime))]/10"
                                    onClick={() => handleBulkAction('hide')}
                                    disabled={actionLoading === 'bulk'}
                                >
                                    <EyeOff size={14} className="mr-1.5" /> Hide
                                </Button>
                                <div className="h-4 w-px bg-[hsl(var(--neon-lime))]/20 mx-1" />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                    onClick={() => handleBulkAction('delete')}
                                    disabled={actionLoading === 'bulk'}
                                >
                                    <Trash2 size={14} className="mr-1.5" /> Delete
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-gray-400 hover:text-white ml-2"
                                    onClick={() => setSelectedItems(new Set())}
                                >
                                    <X size={14} />
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Unified Table */}
                <InventoryTable
                    items={mappedItems}
                    isLoading={loading}
                    loadingId={loadingId}
                    onToggle={(item, checked) =>
                        toggleVisibility({
                            providerId: item.provider,
                            externalId: item.externalId,
                            type: 'auto' // Crucial: Let backend resolve the real type
                        }, checked)
                    }
                    onEdit={(item) =>
                        openEditModal(
                            item.type,
                            item.provider,
                            item.externalId,
                            item.name,
                            item.iconUrl
                        )
                    }
                    onDelete={(item) =>
                        openDeleteDialog(
                            item.type,
                            item.provider,
                            item.externalId,
                            item.name
                        )
                    }
                />

                {/* Pagination */}
                <div className="p-4 border-t border-white/5 flex justify-center gap-2">
                    <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                        {t('actions.prev')}
                    </Button>
                    <span className="px-4 py-2 text-sm text-gray-500">{t('actions.page', { current: page, total: totalPages })}</span>
                    <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        {t('actions.next')}
                    </Button>
                </div>
            </div>

            {/* Edit Modal */}
            {editModal && (
                <InventoryEditModal
                    type={editModal.type}
                    providerId={editModal.providerId}
                    providerDisplayName={editModal.providerDisplayName}
                    externalId={editModal.externalId}
                    currentData={editModal.currentData}
                    isOpen={editModal.isOpen}
                    onClose={() => setEditModal(null)}
                    onSuccess={() => fetchData()}
                />
            )}

            {/* Delete Confirmation Dialog */}
            {deleteDialog && (
                <DeleteConfirmDialog
                    title={`Delete ${deleteDialog.type === 'country' ? 'Country' : 'Service'}?`}
                    description={`This will remove this ${deleteDialog.type} offering from the system.`}
                    itemName={deleteDialog.itemName}
                    isOpen={deleteDialog.isOpen}
                    isLoading={deleteLoading}
                    onClose={() => setDeleteDialog(null)}
                    onConfirm={handleDeleteConfirm}
                />
            )}
        </div >
    )
}
