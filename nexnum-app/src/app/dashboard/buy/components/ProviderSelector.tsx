"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    Server,
    Check,
    Loader2,
    TrendingUp,
    Package,
    DollarSign,
    Star,
    Filter,
    ShoppingCart
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Helper hook for IntersectionObserver
function useInView(options = {}) {
    const [isIntersecting, setIntersecting] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            setIntersecting(entry.isIntersecting);
        }, options);

        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [ref, options]);

    return { ref, isIntersecting };
}

export interface Provider {
    id: string;
    provider: string;
    displayName: string;
    serviceName: string;
    serviceCode: string;
    countryName: string;
    countryCode: string;
    price: number;
    stock: number;
    successRate?: number;
    logoUrl?: string;
}

interface ProviderSelectorProps {
    serviceCode: string;
    serviceName: string;
    countryCode: string;
    countryName: string;
    onBuy: (provider: Provider) => void;
}

type SortOption = "price_asc" | "price_desc" | "stock_desc";

export default function ProviderSelector({
    serviceCode,
    serviceName,
    countryCode,
    countryName,
    onBuy
}: ProviderSelectorProps) {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [sortOption, setSortOption] = useState<SortOption>("price_asc");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // Pagination
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Fetch providers
    useEffect(() => {
        setProviders([]);
        setPage(1);
        setHasMore(true);
        fetchProviders(1, true);
    }, [serviceCode, countryCode, sortOption]);

    const fetchProviders = async (pageToFetch: number, isReset: boolean) => {
        if (isReset) setLoading(true);
        else setLoadingMore(true);

        try {
            const res = await fetch(
                `/api/search/providers?service=${encodeURIComponent(serviceCode)}&country=${encodeURIComponent(countryCode)}&page=${pageToFetch}&limit=20&sort=${sortOption}`
            );
            const data = await res.json();

            const newItems = data.items || [];
            const meta = data.pagination || {};

            if (isReset) {
                setProviders(newItems);
            } else {
                setProviders(prev => [...prev, ...newItems]);
            }

            setHasMore(meta.hasMore ?? (newItems.length > 0));
        } catch (error) {
            console.error("Failed to load providers", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    // Load More Logic
    const { ref: loadMoreRef, isIntersecting } = useInView({ threshold: 0.5 });

    useEffect(() => {
        if (isIntersecting && hasMore && !loading && !loadingMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchProviders(nextPage, false);
        }
    }, [isIntersecting, hasMore, loading, loadingMore, page]);

    const handleSelect = (provider: Provider) => {
        setSelectedId(provider.id);
    };

    const handleBuy = (provider: Provider) => {
        onBuy(provider);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--neon-lime))] mb-4" />
                <p className="text-gray-400 text-sm">Loading providers...</p>
            </div>
        );
    }

    if (providers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Server className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm">No providers available for {serviceName} in {countryName}</p>
                <p className="text-xs mt-2 opacity-70">Try selecting a different country or service</p>
            </div>
        );
    }

    return (
        <section className="py-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white">
                        Available Providers
                    </h3>
                    <p className="text-sm text-gray-400">
                        {providers.length}+ operators for {serviceName} in {countryName}
                    </p>
                </div>

                {/* Sort Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-300 hover:bg-white/10 transition-colors">
                            <Filter className="w-3.5 h-3.5" />
                            <span>Sort By</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-black/90 border-white/10 backdrop-blur-md">
                        <DropdownMenuItem onClick={() => setSortOption("price_asc")}>
                            <DollarSign className="w-3.5 h-3.5 mr-2" /> Cheapest First
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortOption("price_desc")}>
                            <TrendingUp className="w-3.5 h-3.5 mr-2" /> Most Expensive
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortOption("stock_desc")}>
                            <Package className="w-3.5 h-3.5 mr-2" /> Highest Stock
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Provider Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                    {providers.map((provider, index) => {
                        const isSelected = selectedId === provider.id;
                        const isBestPrice = index === 0 && sortOption === "price_asc";

                        return (
                            <motion.div
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                key={provider.id}
                                onClick={() => handleSelect(provider)}
                                className={cn(
                                    "relative group cursor-pointer rounded-xl border p-4 transition-all duration-200",
                                    isSelected
                                        ? "bg-[hsl(var(--neon-lime)/0.1)] border-[hsl(var(--neon-lime)/0.5)] shadow-[0_0_20px_hsl(var(--neon-lime)/0.15)]"
                                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                {/* Best Price Badge */}
                                {isBestPrice && (
                                    <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-[hsl(var(--neon-lime))] text-black text-[10px] font-bold flex items-center gap-1">
                                        <Star className="w-3 h-3" /> Best Price
                                    </div>
                                )}

                                {/* Selected Check */}
                                {isSelected && (
                                    <div className="absolute top-2 left-2">
                                        <div className="w-5 h-5 rounded-full bg-[hsl(var(--neon-lime))] flex items-center justify-center">
                                            <Check className="w-3 h-3 text-black" strokeWidth={3} />
                                        </div>
                                    </div>
                                )}

                                {/* Provider Info */}
                                <div className="flex items-start gap-3">
                                    {/* Logo */}
                                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                        {provider.logoUrl ? (
                                            <img
                                                src={provider.logoUrl}
                                                alt={provider.displayName}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Server className="w-5 h-5 text-gray-400" />
                                        )}
                                    </div>

                                    {/* Details */}
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-white truncate">
                                            {provider.displayName}
                                        </h4>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {provider.provider}
                                        </p>
                                    </div>
                                </div>

                                {/* Stats Row */}
                                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5">
                                    {/* Price */}
                                    <div className="flex items-center gap-1.5">
                                        <DollarSign className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                                        <span className="text-lg font-bold text-white">
                                            ${provider.price.toFixed(2)}
                                        </span>
                                    </div>

                                    {/* Stock */}
                                    <div className="flex items-center gap-1.5">
                                        <Package className="w-3.5 h-3.5 text-gray-400" />
                                        <span className={cn(
                                            "text-sm",
                                            provider.stock > 100 ? "text-green-400" :
                                                provider.stock > 10 ? "text-yellow-400" : "text-red-400"
                                        )}>
                                            {provider.stock > 1000 ? '1k+' : provider.stock} in stock
                                        </span>
                                    </div>

                                    {/* Success Rate */}
                                    {provider.successRate && (
                                        <div className="flex items-center gap-1 ml-auto">
                                            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                            <span className="text-xs text-blue-400">
                                                {provider.successRate}%
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Buy Button (shown on hover or selected) */}
                                <motion.button
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: isSelected ? 1 : 0, y: isSelected ? 0 : 5 }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleBuy(provider);
                                    }}
                                    className={cn(
                                        "w-full mt-4 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all",
                                        "bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime)/0.9)]",
                                        !isSelected && "opacity-0 group-hover:opacity-100"
                                    )}
                                >
                                    <ShoppingCart className="w-4 h-4" />
                                    Buy for ${provider.price.toFixed(2)}
                                </motion.button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Load More */}
            {hasMore && (
                <div ref={loadMoreRef} className="py-8 flex justify-center items-center">
                    {loadingMore && <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-lime))]" />}
                </div>
            )}
        </section>
    );
}
