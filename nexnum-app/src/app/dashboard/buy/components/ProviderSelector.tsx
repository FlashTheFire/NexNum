"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/utils";
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags";
import {
    Server,
    Check,
    Loader2,
    TrendingUp,
    Package,
    DollarSign,
    Star,
    Filter,
    ShoppingCart,
    Signal,
    Zap,
    ShieldCheck
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
    displayName: string;
    serviceName: string;
    serviceSlug: string;
    countryName: string;
    countryCode: string;
    flagUrl?: string;
    iconUrl?: string;
    price: number;
    stock: number;
    successRate?: number;
    logoUrl?: string;
    // Operator info
    operatorId: number;
    operatorDisplayName: string;
}

interface ProviderSelectorProps {
    serviceCode: string;
    serviceName: string;
    countryCode: string;
    countryName: string;
    onBuy: (provider: Provider) => void;
    sortOption: "relevance" | "price_asc" | "stock_desc";
    serviceIcon?: string;
}


// Skeleton Component
const CardSkeleton = () => (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4 animate-pulse">
        <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-white/10" />
            <div className="flex-1 space-y-2">
                <div className="h-4 bg-white/10 rounded w-2/3" />
                <div className="h-3 bg-white/5 rounded w-1/3" />
            </div>
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-white/5">
            <div className="h-5 bg-white/10 rounded w-16" />
            <div className="h-4 bg-white/5 rounded w-12" />
        </div>
        <div className="h-10 bg-white/5 rounded-lg mt-4" />
    </div>
);

export default function ProviderSelector({
    serviceCode,
    serviceName,
    countryCode,
    countryName,
    onBuy,
    sortOption,
    serviceIcon
}: ProviderSelectorProps) {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);

    // Pagination
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);


    // Helper to validate if a URL is a valid flag URL
    const isValidFlagUrl = (url?: string) => {
        if (!url) return false;
        if (url.includes('circle-flags') && /\/flags\/\d+\.svg$/.test(url)) return false;
        return true;
    };

    const getCountryDisplay = (countryName: string, countryCode: string, flagUrl?: string) => {
        // 1. Prioritize Server-provided flagUrl (it's already name-based and robust)
        if (isValidFlagUrl(flagUrl)) {
            return <img src={flagUrl} alt={countryName} className="w-full h-full rounded-full object-cover shadow-sm ring-1 ring-white/10" />;
        }

        // 2. Fallback to name-based lookup (Universal)
        const nameBasedFlag = getCountryFlagUrlSync(countryName);
        if (nameBasedFlag) {
            return <img src={nameBasedFlag} alt={countryName} className="w-full h-full rounded-full object-cover shadow-sm ring-1 ring-white/10" />;
        }

        // 3. Last resort: code-based lookup
        const codeBasedFlag = getCountryFlagUrlSync(countryCode);
        if (codeBasedFlag) {
            return <img src={codeBasedFlag} alt={countryName} className="w-full h-full rounded-full object-cover shadow-sm ring-1 ring-white/10" />;
        }

        return <span className="text-lg bg-white/5 p-1.5 rounded-full">🌍</span>;
    };

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
        setSelectedId(provider.operatorId);
    };

    const handleBuy = (provider: Provider) => {
        onBuy(provider);
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <section className="py-4 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        Select Provider
                    </h3>
                    <p className="text-sm text-gray-400">
                        Top rated operators for <span className="text-white">{serviceName}</span>
                    </p>
                </div>

            </div>

            {/* Provider Cards */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
                <AnimatePresence mode="popLayout">
                    {providers.map((provider, index) => {
                        const isSelected = selectedId === provider.operatorId;
                        const isBestPrice = index === 0 && sortOption === "price_asc";
                        const isHighStock = provider.stock > 1000;
                        const isVerified = provider.successRate && provider.successRate > 70;

                        return (
                            <motion.div
                                layout
                                variants={itemVariants}
                                exit={{ opacity: 0, scale: 0.95 }}
                                key={`${provider.displayName}_${provider.operatorId}`}
                                onClick={() => handleSelect(provider)}
                                className={cn(
                                    "relative group cursor-pointer rounded-xl border p-3 transition-all duration-300 overflow-hidden",
                                    isSelected
                                        ? "bg-[hsl(var(--neon-lime)/0.05)] border-[hsl(var(--neon-lime)/0.5)] shadow-[0_0_30px_-10px_hsl(var(--neon-lime)/0.3)]"
                                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                {/* Selection Glow */}
                                {isSelected && (
                                    <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--neon-lime)/0.1)] to-transparent pointer-events-none" />
                                )}

                                {/* Badges */}
                                <div className="absolute top-3 right-3 flex gap-2">
                                    {isBestPrice && (
                                        <div className="px-2 py-0.5 rounded-full bg-[hsl(var(--neon-lime))] text-black text-[10px] font-bold flex items-center gap-1 shadow-lg shadow-[hsl(var(--neon-lime)/0.2)]">
                                            <Zap className="w-3 h-3 fill-black" /> BEST PRICE
                                        </div>
                                    )}
                                    {isHighStock && !isBestPrice && (
                                        <div className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[10px] font-bold flex items-center gap-1">
                                            <Signal className="w-3 h-3" /> HIGH STOCK
                                        </div>
                                    )}
                                </div>

                                {/* Provider Info */}
                                <div className="flex items-center gap-3 mb-3 relative z-10 w-full">
                                    <div className="relative w-10 h-10 flex-shrink-0">
                                        {/* Icon container - always has strong neon glow */}
                                        <div className={cn(
                                            "relative w-full h-full rounded-lg overflow-hidden transition-all duration-300",
                                            "ring-2 ring-[hsl(var(--neon-lime))] ring-offset-1 ring-offset-[#0a0a0c]",
                                            "shadow-[0_0_12px_hsl(var(--neon-lime)/0.35)]",
                                            "group-hover:scale-105"
                                        )}>
                                            {(serviceIcon?.includes('dicebear') || (!serviceIcon && !provider.iconUrl)) ? (
                                                <div className="relative w-full h-full flex items-center justify-center bg-white/5">
                                                    <img
                                                        src={serviceIcon || provider.iconUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(provider.serviceName)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`}
                                                        alt=""
                                                        className="absolute inset-0 w-full h-full object-cover blur-[2px] scale-150 opacity-50"
                                                    />
                                                    <img
                                                        src="/placeholder-icon.png"
                                                        alt={provider.serviceName}
                                                        className="relative z-10 w-[65%] h-[65%] object-contain opacity-80"
                                                    />
                                                </div>
                                            ) : (
                                                <img
                                                    src={serviceIcon || provider.iconUrl}
                                                    alt={provider.serviceName}
                                                    className="w-full h-full object-contain filter brightness-110 contrast-110"
                                                />
                                            )}
                                        </div>

                                        {/* Country Flag Badge */}
                                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#151518] overflow-hidden shadow-md z-20">
                                            {getCountryDisplay(provider.countryName, provider.countryCode, provider.flagUrl)}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h4 className={cn(
                                            "font-semibold text-sm truncate transition-colors leading-tight",
                                            isSelected ? "text-[hsl(var(--neon-lime))]" : "text-white"
                                        )}>
                                            {provider.displayName}
                                        </h4>
                                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                            {provider.serviceName}
                                        </p>
                                        {isVerified && (
                                            <span className="inline-flex items-center gap-0.5 text-[9px] text-green-400 font-medium mt-0.5">
                                                <ShieldCheck className="w-2.5 h-2.5" /> Verified
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Stats Row */}
                                <div className="grid grid-cols-2 gap-2 relative z-10">
                                    {/* Price */}
                                    <div className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/5">
                                        <span className="text-[9px] text-gray-500 uppercase tracking-wider">Price</span>
                                        <div className="flex items-baseline gap-0.5">
                                            <span className="text-base font-bold text-white">${provider.price.toFixed(2)}</span>
                                            <span className="text-[9px] text-gray-500">/num</span>
                                        </div>
                                    </div>

                                    {/* Stock - Advanced */}
                                    <div className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/5">
                                        <span className="text-[9px] text-gray-500 uppercase tracking-wider">Available</span>
                                        <div className="flex items-center gap-1.5">
                                            <span className={cn(
                                                "text-sm font-bold tabular-nums",
                                                provider.stock >= 10000 ? "text-emerald-400" :
                                                    provider.stock >= 1000 ? "text-green-400" :
                                                        provider.stock >= 100 ? "text-lime-400" :
                                                            provider.stock >= 10 ? "text-yellow-400" : "text-red-400"
                                            )}>
                                                {provider.stock >= 100000 ? `${(provider.stock / 1000).toFixed(0)}K` :
                                                    provider.stock >= 10000 ? `${(provider.stock / 1000).toFixed(1)}K` :
                                                        provider.stock >= 1000 ? `${(provider.stock / 1000).toFixed(1)}K` :
                                                            provider.stock.toLocaleString()}
                                            </span>
                                            {/* 5-segment stock bar for large ranges */}
                                            <div className="flex gap-px h-1.5 flex-1 max-w-[40px]">
                                                <div className={cn("w-full rounded-l-sm transition-colors",
                                                    provider.stock > 0 ? "bg-green-500" : "bg-white/10")} />
                                                <div className={cn("w-full transition-colors",
                                                    provider.stock >= 100 ? "bg-green-500" : "bg-white/10")} />
                                                <div className={cn("w-full transition-colors",
                                                    provider.stock >= 1000 ? "bg-green-500" : "bg-white/10")} />
                                                <div className={cn("w-full transition-colors",
                                                    provider.stock >= 10000 ? "bg-emerald-500" : "bg-white/10")} />
                                                <div className={cn("w-full rounded-r-sm transition-colors",
                                                    provider.stock >= 50000 ? "bg-emerald-400" : "bg-white/10")} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Buy Button */}
                                <motion.button
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{
                                        opacity: isSelected ? 1 : 0,
                                        height: isSelected ? 'auto' : 0,
                                        marginTop: isSelected ? 16 : 0
                                    }}
                                    className={cn(
                                        "w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 relative overflow-hidden z-20",
                                        "bg-[hsl(var(--neon-lime))] text-black shadow-lg shadow-[hsl(var(--neon-lime)/0.2)] hover:shadow-[hsl(var(--neon-lime)/0.4)] transition-shadow"
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleBuy(provider);
                                    }}
                                >
                                    <ShoppingCart className="w-4 h-4 fill-black" />
                                    <span>Purchase Number</span>
                                </motion.button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </motion.div>

            {/* Load More */}
            {hasMore && (
                <div ref={loadMoreRef} className="py-8 flex justify-center items-center">
                    {loadingMore && <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-lime))]" />}
                </div>
            )}
        </section>
    );
}
