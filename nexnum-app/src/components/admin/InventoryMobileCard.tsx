"use client"

import { motion } from "framer-motion"
import {
    Globe,
    Smartphone,
    Eye,
    EyeOff,
    Edit,
    Trash2,
    ChevronRight,
    MoreHorizontal,
    Package,
    DollarSign
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"
import { useState } from "react"

interface ProviderInfo {
    provider: string
    externalId: string
    stock: number
    minPrice: number
    maxPrice: number
    isActive?: boolean
}

interface InventoryMobileCardProps {
    type: 'country' | 'service'
    name: string
    iconUrl?: string
    flagUrl?: string
    providers: ProviderInfo[]
    totalStock: number
    priceRange: { min: number; max: number }
    lastSyncedAt?: number
    onEdit: (provider: string, externalId: string) => void
    onToggleVisibility: (provider: string, externalId: string, currentlyActive: boolean) => void
    onDelete: (provider: string, externalId: string, name: string) => void
    isLoading?: string | null
}

export function InventoryMobileCard({
    type,
    name,
    iconUrl,
    flagUrl,
    providers,
    totalStock,
    priceRange,
    lastSyncedAt,
    onEdit,
    onToggleVisibility,
    onDelete,
    isLoading
}: InventoryMobileCardProps) {
    const [expanded, setExpanded] = useState(false)
    const Icon = type === 'country' ? Globe : Smartphone
    const imageUrl = type === 'country' ? flagUrl : iconUrl

    const hasHiddenProviders = providers.some(p => p.isActive === false)

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#111318]/80 border border-white/5 rounded-xl overflow-hidden"
        >
            {/* Main Card */}
            <div
                className="p-4 flex items-center gap-3 cursor-pointer active:bg-white/5"
                onClick={() => setExpanded(!expanded)}
            >
                {/* Icon/Flag */}
                <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {imageUrl ? (
                        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <Icon size={24} className="text-gray-500" />
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-white truncate">{name}</h3>
                        {hasHiddenProviders && (
                            <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1 py-0.5 rounded border border-orange-500/20 shrink-0">
                                HIDDEN
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Package size={10} />
                            {providers.length} provider{providers.length > 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-emerald-400 font-mono">
                            {totalStock > 0 ? totalStock.toLocaleString() : '-'}
                        </span>
                        {priceRange.min > 0 && (
                            <span className="text-xs text-yellow-400 font-mono">
                                ${priceRange.min.toFixed(2)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Expand Arrow */}
                <motion.div
                    animate={{ rotate: expanded ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronRight size={20} className="text-gray-500" />
                </motion.div>
            </div>

            {/* Expanded Providers */}
            {expanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-white/5 bg-black/20"
                >
                    {providers.map((p, idx) => (
                        <div
                            key={`${p.provider}-${idx}`}
                            className={`p-3 flex items-center justify-between gap-3 ${idx < providers.length - 1 ? 'border-b border-white/5' : ''
                                } ${p.isActive === false ? 'opacity-50' : ''}`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-white uppercase tracking-wide">
                                        {p.provider}
                                    </span>
                                    {p.isActive === false && (
                                        <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1 py-0.5 rounded">
                                            Hidden
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs text-gray-500 font-mono">
                                        {p.externalId}
                                    </span>
                                    <span className="text-xs text-emerald-400 font-mono">
                                        {p.stock > 0 ? p.stock.toLocaleString() : '-'}
                                    </span>
                                    <span className="text-xs text-yellow-400 font-mono">
                                        ${p.minPrice.toFixed(2)}
                                        {p.maxPrice !== p.minPrice && (
                                            <span className="text-gray-500"> - ${p.maxPrice.toFixed(2)}</span>
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-blue-400"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onEdit(p.provider, p.externalId)
                                    }}
                                >
                                    <Edit size={14} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    disabled={isLoading === `${p.provider}_${p.externalId}`}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onToggleVisibility(p.provider, p.externalId, p.isActive !== false)
                                    }}
                                >
                                    {p.isActive !== false ? (
                                        <Eye size={14} className="text-gray-400" />
                                    ) : (
                                        <EyeOff size={14} className="text-orange-400" />
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-400/60"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onDelete(p.provider, p.externalId, name)
                                    }}
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        </div>
                    ))}

                    {/* Footer */}
                    {lastSyncedAt && (
                        <div className="p-2 text-center text-[10px] text-gray-600 border-t border-white/5">
                            Last synced {formatDistanceToNow(new Date(lastSyncedAt))} ago
                        </div>
                    )}
                </motion.div>
            )}
        </motion.div>
    )
}
