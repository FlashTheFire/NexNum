import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Search, Check, Package, AlertTriangle, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags";
import { usePinnedItems } from "@/hooks/usePinnedItems";

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

// Check for reduced motion preference
function usePrefersReducedMotion() {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setPrefersReducedMotion(mq.matches);
        const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);
    return prefersReducedMotion;
}

interface Country {
    id: string;
    name: string;
    code: string;
    identifier?: string;
    flagUrl?: string;
    minPrice?: number;
    totalStock?: number;
}

// Format price with localization
const formatPrice = (price: number | undefined, locale = "en-US", currency = "USD") => {
    if (price === undefined || price === null) return "$0.00";
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(price);
};

// Format stock count for display
const formatStock = (stock: number | undefined): string => {
    if (!stock || stock === 0) return "0";
    if (stock >= 1000000) return `${(stock / 1000000).toFixed(1)}M`;
    if (stock >= 1000) return `${(stock / 1000).toFixed(1)}K`;
    return stock.toString();
};

// Determine stock status for styling
type StockStatus = "high" | "medium" | "low" | "out";
const getStockStatus = (stock: number | undefined): StockStatus => {
    if (!stock || stock === 0) return "out";
    if (stock < 100) return "low";
    if (stock < 1000) return "medium";
    return "high";
};

// --- Flag Component with Lazy Loading ---
const FlagImage = ({
    name,
    providerId,
    flagUrl,
    className,
    size = "md"
}: {
    name: string;
    providerId?: string;
    flagUrl?: string;
    className?: string;
    size?: "sm" | "md" | "lg";
}) => {
    const [error, setError] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const src = (name ? getCountryFlagUrlSync(name) : undefined)
        || (providerId ? getCountryFlagUrlSync(providerId) : undefined)
        || flagUrl;

    useEffect(() => {
        setError(false);
        setLoaded(false);
    }, [src]);

    const sizeClasses = {
        sm: "w-6 h-6",
        md: "w-10 h-10",
        lg: "w-12 h-12"
    };

    if ((!name && !providerId) || error || !src) {
        return (
            <div className={cn(
                "flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5 rounded-full border border-white/10",
                sizeClasses[size],
                className
            )}>
                <Globe className="w-1/2 h-1/2 text-gray-500" />
            </div>
        );
    }

    return (
        <div className={cn("relative rounded-full overflow-hidden bg-white/5", sizeClasses[size], className)}>
            <img
                src={src}
                alt={name}
                className="w-full h-full object-cover rounded-full ring-1 ring-white/10"
                onError={() => setError(true)}
                loading="lazy"
            />
        </div>
    );
};

// --- InfoBadge Component (Simplified) ---
const InfoBadge = ({
    icon: Icon,
    value,
    variant = "default"
}: {
    icon: any;
    value: string;
    variant?: "default" | "success" | "warning" | "danger" | "info";
}) => {
    const textColors = {
        default: "text-gray-400",
        success: "text-emerald-400",
        warning: "text-amber-400",
        danger: "text-red-400",
        info: "text-blue-400"
    };

    return (
        <div className={cn(
            "flex items-center gap-1.5 text-[10px] font-medium transition-all",
            textColors[variant]
        )}>
            <Icon className="w-3 h-3" />
            <span>{value} Stocks</span>
        </div>
    );
};

const CountryCard = React.memo(({
    country,
    isSelected,
    pinned,
    onSelect,
    togglePin,
    index,
    prefersReducedMotion,
    selectedService,
    stockStatus,
    isOutOfStock
}: {
    country: Country;
    isSelected: boolean;
    pinned: boolean;
    onSelect: (country: Country) => void;
    togglePin: (country: Country) => void;
    index: number;
    prefersReducedMotion: boolean;
    selectedService: any;
    stockStatus: StockStatus;
    isOutOfStock: boolean;
}) => {
    const itemVariants = {
        hidden: { opacity: 0, scale: 0.95 },
        show: { opacity: 1, scale: 1 }
    };

    return (
        <motion.div
            variants={itemVariants}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={() => !isOutOfStock && onSelect(country)}
            role="button"
            tabIndex={isOutOfStock ? -1 : 0}
            onKeyDown={(e) => {
                if (!isOutOfStock && (e.key === 'Enter' || e.key === ' ')) {
                    onSelect(country);
                }
            }}
            aria-disabled={isOutOfStock}
            aria-label={`Select ${country.name}${selectedService ? `, price from ${formatPrice(country.minPrice)}` : ""}`}
            aria-pressed={isSelected}
            data-country-id={country.id}
            data-stock-status={stockStatus}
            style={{ willChange: 'transform' } as React.CSSProperties}
            className={cn(
                "relative flex items-center gap-3 p-3 rounded-xl border text-left w-full cursor-pointer",
                "transition-all duration-300 outline-none",
                "focus-visible:ring-2 focus-visible:ring-[hsl(var(--neon-lime))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0c]",
                isOutOfStock && "opacity-50 cursor-not-allowed",
                isSelected
                    ? "bg-gradient-to-br from-[hsl(var(--neon-lime)/0.08)] to-[hsl(var(--neon-lime)/0.02)] border-[hsl(var(--neon-lime)/0.4)] shadow-[0_0_20px_hsl(var(--neon-lime)/0.1)]"
                    : "bg-gradient-to-br from-white/[0.04] to-white/[0.01] border-white/5 hover:border-white/25 hover:from-white/[0.08] hover:shadow-2xl hover:-translate-y-1",
                !prefersReducedMotion && "group"
            )}
        >
            {/* Hover glow ring */}
            {!prefersReducedMotion && !isOutOfStock && (
                <div className={cn(
                    "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-500",
                    "bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-cyan-500/10",
                    "blur-md scale-110 group-hover:scale-125 pointer-events-none"
                )} />
            )}
            {/* Selection Glow Background */}
            {isSelected && (
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-[hsl(var(--neon-lime)/0.05)] via-transparent to-transparent pointer-events-none" />
            )}

            {/* Flag with hover scale/rotate */}
            <div className={cn(
                "relative shrink-0 transition-all duration-300 rounded-full",
                !prefersReducedMotion && "group-hover:scale-110 group-hover:rotate-3",
                "ring-[hsl(var(--neon-lime))] ring-offset-2 ring-offset-[#0a0a0c] transition-[ring]",
                isSelected ? "scale-100 ring-2" : "ring-0"
            )}>
                <FlagImage
                    name={country.name}
                    providerId={country.code}
                    flagUrl={country.flagUrl}
                    size="md"
                />
                {isSelected && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[hsl(var(--neon-lime))] flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.3)]">
                        <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <h4 className={cn(
                        "text-sm font-bold truncate transition-colors",
                        isSelected ? "text-white" : "text-gray-200 group-hover:text-white"
                    )}>
                        {country.name}
                    </h4>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            togglePin(country);
                        }}
                        className={cn(
                            "shrink-0 p-1 rounded-full transition-all duration-300 relative z-30",
                            (pinned || isSelected)
                                ? "opacity-100 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 hover:scale-110"
                                : "opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white hover:bg-white/10 scale-90 hover:scale-100"
                        )}
                        title={pinned ? "Unpin country" : "Pin sort to top"}
                    >
                        <Star className={cn("w-3 h-3", pinned && "fill-yellow-500")} strokeWidth={pinned ? 3 : 2} />
                    </button>
                </div>

                {/* Badges Row */}
                {selectedService && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                        <InfoBadge
                            icon={Package}
                            value={formatStock(country.totalStock)}
                            variant={
                                stockStatus === "out" ? "danger" :
                                    stockStatus === "low" ? "warning" :
                                        stockStatus === "medium" ? "info" :
                                            stockStatus === "high" ? "success" :
                                                "default"
                            }
                        />
                    </div>
                )}
            </div>

            {/* Price Block */}
            {selectedService && (
                <div className={cn(
                    "shrink-0 text-right px-2.5 py-1.5 rounded-lg transition-colors",
                    isSelected
                        ? "bg-[hsl(var(--neon-lime)/0.1)]"
                        : "bg-white/[0.03] group-hover:bg-white/[0.06]"
                )}>
                    <div className="text-[8px] uppercase tracking-wider text-gray-500 font-medium leading-tight mb-0.5">
                        From
                    </div>
                    <div className={cn(
                        "text-base font-bold tabular-nums leading-tight flex items-baseline justify-end gap-0.5",
                        isSelected
                            ? "text-[hsl(var(--neon-lime))]"
                            : "text-white group-hover:text-[hsl(var(--neon-lime))]"
                    )}>
                        {(() => {
                            const formatted = formatPrice(country.minPrice);
                            const parts = formatted.split('.');
                            if (parts.length === 2) {
                                return (
                                    <>
                                        <span>{parts[0]}</span>
                                        <span className="text-[0.7em] opacity-80">.{parts[1]}</span>
                                    </>
                                );
                            }
                            return formatted;
                        })()}
                    </div>
                </div>
            )}

            {/* Out of Stock Overlay */}
            {isOutOfStock && (
                <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                    <span className="text-xs font-medium text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
                        Out of Stock
                    </span>
                </div>
            )}
        </motion.div>
    );
});

CountryCard.displayName = "CountryCard";

// Skeleton Component - Matches new card design
const CardSkeleton = () => (
    <div className="rounded-xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-3 animate-pulse">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
            <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-white/10 rounded w-2/3" />
                <div className="flex gap-1.5">
                    <div className="h-5 bg-white/5 rounded-full w-12" />
                    <div className="h-5 bg-white/5 rounded-full w-10" />
                </div>
            </div>
            <div className="h-7 w-16 bg-white/10 rounded-lg" />
        </div>
    </div>
);



interface CountrySelectorProps {
    onSelect: (country: Country) => void;
    selectedCountryId: string | null;
    defaultSelected?: Country | null;
    searchTerm: string;
    selectedService?: { id: string; name: string; iconUrl?: string } | null;
    sortOption: "relevance" | "price_asc" | "stock_desc";
}

export default function CountrySelector({
    onSelect,
    selectedCountryId,
    defaultSelected,
    searchTerm,
    selectedService,
    sortOption
}: CountrySelectorProps) {
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const prefersReducedMotion = usePrefersReducedMotion();
    const { pinnedItems, isPinned, togglePin } = usePinnedItems<Country>("pinned_countries");

    // Reset when search/service/sort changes
    useEffect(() => {
        setCountries([]);
        setPage(1);
        setHasMore(true);
        fetchCountries(1, searchTerm, sortOption, true);
    }, [selectedService?.id, searchTerm, sortOption]);

    const fetchCountries = async (pageToFetch: number, search: string, sort: string, isReset: boolean) => {
        if (isReset) setLoading(true);
        else setLoadingMore(true);

        try {
            const serviceQuery = selectedService?.name ? `&service=${encodeURIComponent(selectedService.name)}` : "";
            const searchQuery = search ? `&q=${encodeURIComponent(search)}` : "";

            const res = await fetch(`/api/public/countries?page=${pageToFetch}&limit=24&sort=${sort}${serviceQuery}${searchQuery}`);

            if (!res.ok) {
                console.warn(`[CountrySelector] API returned ${res.status}: ${res.statusText}`);
                throw new Error(`Country search failed: ${res.status}`);
            }

            let data;
            try {
                data = await res.json();
            } catch (e) {
                console.error("[CountrySelector] Failed to parse JSON response", e);
                throw new Error("Invalid API response format");
            }

            const newItems = data.items || [];
            const meta = data.pagination || {};

            if (isReset) {
                if (defaultSelected) {
                    const targetId = defaultSelected.id.toLowerCase();
                    const targetName = defaultSelected.name.toLowerCase();

                    let idx = newItems.findIndex((c: Country) => c.id.toLowerCase() === targetId);
                    if (idx === -1) {
                        idx = newItems.findIndex((c: Country) => c.name.toLowerCase() === targetName);
                    }

                    if (idx > -1) {
                        const [item] = newItems.splice(idx, 1);
                        newItems.unshift(item);
                    } else if (pageToFetch === 1 && !search) {
                        newItems.unshift(defaultSelected);
                    }
                }
                setCountries(newItems);
            } else {
                setCountries(prev => [...prev, ...newItems]);
            }

            setHasMore(meta.hasMore ?? (newItems.length > 0));
        } catch (error) {
            console.error("Failed to load countries", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    // Derived state for countries: Merge pinned items and sort
    const sortedCountries = useMemo(() => {
        const merged = [...countries];
        // Add pinned items that are not in the current fetched list
        pinnedItems.forEach(pinned => {
            if (!merged.some(c => c.id === pinned.id)) {
                // Only add if it matches search term
                if (!searchTerm || pinned.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                    merged.push(pinned);
                }
            }
        });

        // Sort: Pinned items first
        return merged.sort((a, b) => {
            const aPinned = isPinned(a.id);
            const bPinned = isPinned(b.id);
            if (aPinned === bPinned) return 0;
            return aPinned ? -1 : 1;
        });
    }, [countries, pinnedItems, isPinned, searchTerm]);

    // Load More Logic
    const { ref: loadMoreRef, isIntersecting } = useInView({ threshold: 0.5 });

    useEffect(() => {
        if (isIntersecting && hasMore && !loading && !loadingMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchCountries(nextPage, searchTerm, sortOption, false);
        }
    }, [isIntersecting, hasMore, loading, loadingMore, page, searchTerm, sortOption]);

    // Animation variants (respect reduced motion)
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: prefersReducedMotion ? 0 : 0.02
            }
        }
    };

    const itemVariants = prefersReducedMotion
        ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
        : { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 py-4">
                {[...Array(12)].map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
        );
    }

    return (
        <section className="py-2 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 text-glow">
                    Select Country
                    {selectedService && (
                        <span className="text-gray-500 font-medium flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-gray-700" />
                        </span>
                    )}
                </h3>
            </div>

            {/* Grid - Responsive: stacked mobile, horizontal cards desktop */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
            >
                <AnimatePresence>
                    {sortedCountries.map((country, index) => {
                        const isSelected = Boolean(selectedCountryId === country.id ||
                            (selectedCountryId && country.name.toLowerCase() === selectedCountryId.toLowerCase()));
                        const stockStatus = getStockStatus(country.totalStock);
                        const isOutOfStock = stockStatus === "out";

                        return (
                            <CountryCard
                                key={`${country.id}-${index}`}
                                country={country}
                                isSelected={isSelected}
                                pinned={isPinned(country.id)}
                                onSelect={onSelect}
                                togglePin={togglePin}
                                index={index}
                                prefersReducedMotion={prefersReducedMotion}
                                selectedService={selectedService}
                                stockStatus={stockStatus}
                                isOutOfStock={isOutOfStock}
                            />
                        );
                    })}
                </AnimatePresence>
            </motion.div>

            {/* Load More Sentinel */}
            {
                hasMore && (
                    <div ref={loadMoreRef} className="col-span-full py-8 flex justify-center items-center">
                        {loadingMore && <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-lime))]" />}
                    </div>
                )
            }

            {/* Empty State */}
            {
                countries.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <Search className="w-8 h-8 opacity-30" />
                        </div>
                        <p className="text-sm font-medium">No countries found</p>
                        <p className="text-xs text-gray-600 mt-1">Try adjusting your search</p>
                    </div>
                )
            }
        </section >
    );
}
