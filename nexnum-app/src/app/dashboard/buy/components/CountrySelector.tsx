import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Search, Check, DollarSign, BarChart2, Filter, Loader2, Signal, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCountryFlagUrlSync } from "@/lib/country-flags";
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

interface Country {
    id: string;
    name: string;
    code: string; // Provider code (numeric, not ISO!)
    identifier?: string; // Best provider ID for flag lookup
    flagUrl?: string; // Fallback flag URL from provider
    minPrice?: number;
    totalStock?: number;
}

// --- Flag Component with Name Lookup ---
const FlagImage = ({ name, providerId, flagUrl, className }: { name: string, providerId?: string, flagUrl?: string, className?: string }) => {
    const [error, setError] = useState(false);

    // Synchronous lookup priority: Name -> Provider ID -> Fallback URL
    const src = (name ? getCountryFlagUrlSync(name) : undefined)
        || (providerId ? getCountryFlagUrlSync(providerId) : undefined)
        || flagUrl;

    useEffect(() => {
        // Reset error when props change
        setError(false);
    }, [src]);

    // Safety check return
    if ((!name && !providerId) || error || !src) {
        return (
            <div className={cn("flex items-center justify-center bg-white/10 rounded-full", className)}>
                <Globe className="w-1/2 h-1/2 text-gray-400" />
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={name}
            className={cn("object-cover rounded-full shadow-sm", className)}
            onError={() => setError(true)}
            loading="lazy"
        />
    );
};

// Skeleton Component
const CardSkeleton = () => (
    <div className="rounded-xl border border-white/5 bg-white/5 p-3 flex items-center gap-3 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
        <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/10 rounded w-2/3" />
            <div className="h-3 bg-white/5 rounded w-1/3" />
        </div>
    </div>
);

// ... imports

interface CountrySelectorProps {
    onSelect: (country: Country) => void;
    selectedCountryId: string | null;
    defaultSelected?: Country | null;
    searchTerm: string;
    selectedServiceName?: string;
    sortOption: "relevance" | "price_asc" | "stock_desc";
}

export default function CountrySelector({ onSelect, selectedCountryId, defaultSelected, searchTerm, selectedServiceName, sortOption }: CountrySelectorProps) {
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    // Removed local sortOption state

    // Pagination State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Reset when search/service/sort changes
    useEffect(() => {
        setCountries([]);
        setPage(1);
        setHasMore(true);
        fetchCountries(1, searchTerm, sortOption, true);
    }, [selectedServiceName, searchTerm, sortOption]);

    const fetchCountries = async (pageToFetch: number, search: string, sort: string, isReset: boolean) => {
        // ... (fetch logic remains same, uses 'sort' arg)
        if (isReset) setLoading(true);
        else setLoadingMore(true);

        try {
            // Fetch with service context if available
            const serviceQuery = selectedServiceName ? `&service=${encodeURIComponent(selectedServiceName)}` : "";
            // Pass search term to API if present
            const searchQuery = search ? `&q=${encodeURIComponent(search)}` : "";

            const res = await fetch(`/api/public/countries?page=${pageToFetch}&limit=24&sort=${sort}${serviceQuery}${searchQuery}`);
            const data = await res.json();

            // API returns { items, pagination }
            const newItems = data.items || [];
            const meta = data.pagination || {};

            if (isReset) {
                // Ensure Selected Country is Visible at Top
                if (defaultSelected) {
                    const targetId = defaultSelected.id.toLowerCase();
                    const targetName = defaultSelected.name.toLowerCase();

                    // Try finding by ID first, then by Name
                    let idx = newItems.findIndex((c: Country) => c.id.toLowerCase() === targetId);
                    if (idx === -1) {
                        idx = newItems.findIndex((c: Country) => c.name.toLowerCase() === targetName);
                    }

                    if (idx > -1) {
                        const [item] = newItems.splice(idx, 1);
                        newItems.unshift(item);
                    } else if (pageToFetch === 1 && !search) {
                        // Inject if not found in first page
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

    // Load More Logic
    const { ref: loadMoreRef, isIntersecting } = useInView({ threshold: 0.5 });

    useEffect(() => {
        if (isIntersecting && hasMore && !loading && !loadingMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchCountries(nextPage, searchTerm, sortOption, false);
        }
    }, [isIntersecting, hasMore, loading, loadingMore, page, searchTerm, sortOption]);

    const filteredCountries = countries;

    // ... variants ...
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.03
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 py-4">
                {[...Array(12)].map((_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
        );
    }

    return (
        <section className="py-2 space-y-4">
            {/* Header / Controls */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        Select Country
                    </h3>
                </div>
            </div>

            {/* Grid */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
            >
                <AnimatePresence mode="popLayout">
                    {filteredCountries.map((country, index) => {
                        // Check match by ID OR Name (case-insensitive) for flexible deep linking
                        const isSelected = selectedCountryId === country.id ||
                            (selectedCountryId && country.name.toLowerCase() === selectedCountryId.toLowerCase());
                        return (
                            <motion.button
                                layout
                                variants={itemVariants}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={`${country.id}-${index}`}
                                onClick={() => onSelect(country)}
                                className={cn(
                                    "relative flex items-center justify-between p-3 rounded-xl border transition-all duration-300 group text-left h-full overflow-hidden",
                                    isSelected
                                        ? "bg-[hsl(var(--neon-lime)/0.05)] border-[hsl(var(--neon-lime)/0.5)] shadow-[0_0_15px_hsl(var(--neon-lime)/0.1)]"
                                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                {/* Selection Glow */}
                                {isSelected && (
                                    <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--neon-lime)/0.1)] to-transparent pointer-events-none" />
                                )}

                                <div className="flex items-center gap-3 w-full relative z-10">
                                    <div className={cn(
                                        "transition-transform duration-300 group-hover:scale-110",
                                        isSelected ? "scale-110" : ""
                                    )}>
                                        <FlagImage name={country.name} providerId={country.code} flagUrl={country.flagUrl} className="w-8 h-8 flex-shrink-0" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className={cn(
                                                "text-sm font-bold truncate transition-colors",
                                                isSelected ? "text-white" : "text-gray-200 group-hover:text-white"
                                            )}>
                                                {country.name}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 mt-0.5">
                                            {/* Price Tag */}
                                            {selectedServiceName && (
                                                <div className="flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--neon-lime))]">
                                                    <DollarSign className="w-3 h-3" />
                                                    from ${country.minPrice?.toFixed(2) || "0.00"}
                                                </div>
                                            )}

                                            {/* Stock Tag */}
                                            {selectedServiceName && (
                                                <div className={cn(
                                                    "flex items-center gap-1 text-[10px]",
                                                    (country.totalStock || 0) > 0 ? "text-gray-400" : "text-red-400/70"
                                                )}>
                                                    <Signal className="w-3 h-3" />
                                                    {(country.totalStock || 0) > 1000 ? '1k+' : (country.totalStock || 0)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Active Check */}
                                {isSelected && (
                                    <div className="absolute top-1 right-1 z-20">
                                        <div className="w-4 h-4 rounded-full bg-[hsl(var(--neon-lime))] flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.2)]">
                                            <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                                        </div>
                                    </div>
                                )}
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </motion.div>

            {/* Load More Sentinel */}
            {hasMore && (
                <div ref={loadMoreRef} className="col-span-full py-8 flex justify-center items-center">
                    {loadingMore && <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-lime))]" />}
                </div>
            )}

            {filteredCountries.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <Search className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm">No countries found for "{searchTerm}"</p>
                </div>
            )}
        </section >
    );
}
