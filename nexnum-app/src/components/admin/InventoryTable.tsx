"use client"

import { useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "../ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
    MoreHorizontal,
    Edit,
    Trash2,
    Globe,
    Smartphone,
    AlertCircle
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InventoryMobileCard } from "./InventoryMobileCard"

// Unified Item Interface
export interface InventoryItem {
    id: string              // Unique key
    provider: string        // Slug
    externalId: string      // Code
    name: string
    type: 'country' | 'service'
    iconUrl?: string        // Flag or Icon
    stock: number
    priceRange: { min: number, max: number }
    isActive: boolean
    lastSyncedAt?: number
    providersCount?: number // For aggregated view
}

interface InventoryTableProps {
    items: InventoryItem[]
    isLoading: boolean
    onToggle: (item: InventoryItem, checked: boolean) => void
    onEdit: (item: InventoryItem) => void
    onDelete: (item: InventoryItem) => void
    loadingId?: string | null
}

export function InventoryTable({
    items,
    isLoading,
    onToggle,
    onEdit,
    onDelete,
    loadingId
}: InventoryTableProps) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

    if (items.length === 0 && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-white/5 rounded-xl bg-white/5">
                <AlertCircle className="w-10 h-10 text-gray-500 mb-2" />
                <h3 className="text-lg font-medium text-white">No items found</h3>
                <p className="text-gray-500 max-w-sm mt-1">
                    Try adjusting your filters or search query.
                </p>
            </div>
        )
    }

    // Mobile View (Cards)
    if (isMobile) {
        return (
            <div className="space-y-3">
                {items.map(item => (
                    <InventoryMobileCard
                        key={item.id}
                        type={item.type}
                        name={item.name}
                        iconUrl={item.type === 'service' ? item.iconUrl : undefined}
                        flagUrl={item.type === 'country' ? item.iconUrl : undefined}
                        providers={[{
                            provider: item.provider,
                            externalId: item.externalId,
                            stock: item.stock,
                            minPrice: item.priceRange.min,
                            maxPrice: item.priceRange.max,
                            isActive: item.isActive
                        }]}
                        totalStock={item.stock}
                        priceRange={item.priceRange}
                        lastSyncedAt={item.lastSyncedAt}
                        onEdit={() => onEdit(item)}
                        onToggleVisibility={() => onToggle(item, !item.isActive)}
                        onDelete={() => onDelete(item)}
                        isLoading={loadingId === `${item.provider}:${item.externalId}` ? 'true' : null}
                    />
                ))}
            </div>
        )
    }

    // Desktop View (Table)
    return (
        <div className="border border-white/10 rounded-xl overflow-hidden bg-[#111318]">
            <Table>
                <TableHeader className="bg-black/20">
                    <TableRow className="border-white/5 hover:bg-transparent">
                        <TableHead className="w-[300px]">Identity</TableHead>
                        <TableHead>Provider Details</TableHead>
                        <TableHead className="text-right">Stock & Price</TableHead>
                        <TableHead className="text-center w-[100px]">Status</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item) => {
                        const isProcesssing = loadingId === `${item.provider}:${item.externalId}`
                        const Icon = item.type === 'country' ? Globe : Smartphone

                        return (
                            <TableRow
                                key={item.id}
                                className="border-white/5 hover:bg-white/[0.02]"
                            >
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                            {item.iconUrl ? (
                                                <img
                                                    src={item.iconUrl}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Icon size={18} className="text-gray-500" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-medium text-white flex items-center gap-2">
                                                {item.name}
                                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-white/10 text-gray-500">
                                                    {item.type.toUpperCase()}
                                                </Badge>
                                            </div>
                                            <code className="text-xs text-gray-500 font-mono">
                                                {item.externalId}
                                            </code>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-sm text-gray-300">{item.provider}</span>
                                            {item.providersCount && item.providersCount > 1 && (
                                                <span className="text-xs text-blue-400">
                                                    + {item.providersCount - 1} others
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex flex-col items-end">
                                        <span className={`font-mono font-medium ${item.stock > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                                            {item.stock.toLocaleString()}
                                        </span>
                                        <span className="text-xs text-yellow-400 font-mono">
                                            ${item.priceRange.min.toFixed(2)}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-center">
                                    <Switch
                                        checked={item.isActive}
                                        onCheckedChange={(checked) => onToggle(item, checked)}
                                        disabled={isProcesssing}
                                        className="data-[state=checked]:bg-emerald-500"
                                    />
                                </TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white">
                                                <MoreHorizontal size={16} />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-[#111318] border-white/10">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuSeparator className="bg-white/10" />
                                            <DropdownMenuItem onClick={() => onEdit(item)} className="cursor-pointer">
                                                <Edit className="mr-2 h-4 w-4" /> Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => onDelete(item)}
                                                className="text-red-400 focus:text-red-400 focus:bg-red-900/10 cursor-pointer"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    )
}
