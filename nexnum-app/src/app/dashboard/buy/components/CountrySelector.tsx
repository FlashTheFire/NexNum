import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Search, Check, DollarSign, BarChart2, Filter, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

// Region constants removed


interface Country {
    id: string;
    name: string;
    code: string; // ISO
    phoneCode: string;
    minPrice?: number;
    totalStock?: number;
}

// --- Flag Component with Fallback ---
const FlagImage = ({ code, className }: { code: string, className?: string }) => {
    // Use Circle Flags
    const [src, setSrc] = useState(`https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/${code.toLowerCase()}.svg`);
    const [error, setError] = useState(false);

    useEffect(() => {
        setSrc(`https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/${code.toLowerCase()}.svg`);
        setError(false);
    }, [code]);

    const handleError = () => {
        setError(true);
    };

    if (error) {
        return (
            <div className={cn("flex items-center justify-center bg-white/10 rounded-full", className)}>
                <Globe className="w-1/2 h-1/2 text-gray-400" />
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={code}
            className={cn("object-cover rounded-full shadow-sm", className)}
            onError={handleError}
            loading="lazy"
        />
    );
};

interface CountrySelectorProps {
    onSelect: (country: Country) => void;
    selectedCountryId: string | null;
    searchTerm: string;
    selectedServiceName?: string;
}

type SortOption = "name" | "price_asc" | "price_desc" | "stock_desc";

export default function CountrySelector({ onSelect, selectedCountryId, searchTerm, selectedServiceName }: CountrySelectorProps) {
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [sortOption, setSortOption] = useState<SortOption>("name");

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
        if (isReset) setLoading(true);
        else setLoadingMore(true);

        try {
            // Fetch with service context if available
            const serviceQuery = selectedServiceName ? `&service=${encodeURIComponent(selectedServiceName)}` : "";
            // Note: API filtering is robust, but search term might be client-side? 
            // WAIT: Our API doesn't support 'q' yet, it returns all and we filtered client-side.
            // But for pagination to work, we must assume API returns everything OR we move search to API.
            // Just now, we implemented pagination on the *filtered* results in route.ts, but route.ts DOES NOT filter by `searchTerm` (c.name) yet.
            // This means server returns paginated list of ALL countries, and we filter client-side? NO.
            // If we paginate server-side, we MUST filter server-side.
            // Pass search term to API if present
            const searchQuery = search ? `&q=${encodeURIComponent(search)}` : "";

            const res = await fetch(`/api/public/countries?page=${pageToFetch}&limit=24&sort=${sort}${serviceQuery}${searchQuery}`);
            const data = await res.json();

            // API returns { items, pagination }
            const newItems = data.items || [];
            const meta = data.pagination || {};

            if (isReset) {
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

    // Client-side filtering removed as API handles it now.
    const filteredCountries = countries;

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 py-8">
                {[...Array(9)].map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse border border-white/5" />
                ))}
            </div>
        );
    }

    return (
        <section className="py-4">
            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex-1">
                    {/* Placeholder for future left-aligned controls if needed */}
                </div>

                {/* Sort Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-300 hover:bg-white/10 transition-colors self-start md:self-auto">
                            <Filter className="w-3.5 h-3.5" />
                            <span>Sort By</span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-black/90 border-white/10 backdrop-blur-md">
                        <DropdownMenuItem onClick={() => setSortOption("name")}>Ascending (A-Z)</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortOption("price_asc")}>Price: Low to High</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortOption("price_desc")}>Price: High to Low</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortOption("stock_desc")}>Stock: High to Low</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                <AnimatePresence mode="popLayout">
                    {filteredCountries.map((country) => {
                        const isSelected = selectedCountryId === country.id;
                        return (
                            <motion.button
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={country.id}
                                onClick={() => onSelect(country)}
                                className={cn(
                                    "relative flex items-center justify-between p-3 rounded-xl border transition-all duration-200 group text-left h-full",
                                    isSelected
                                        ? "bg-[hsl(var(--neon-lime)/0.1)] border-[hsl(var(--neon-lime)/0.5)] shadow-[0_0_15px_hsl(var(--neon-lime)/0.1)]"
                                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                <div className="flex items-center gap-3 w-full overflow-hidden">
                                    <FlagImage code={country.code} className="w-8 h-8 flex-shrink-0" />
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
                                            {/* Price Tag (Always show if context exists, even if 0) */}
                                            {selectedServiceName && (
                                                <div className="flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--neon-lime))]">
                                                    <DollarSign className="w-3 h-3" />
                                                    from ${country.minPrice?.toFixed(2) || "0.00"}
                                                </div>
                                            )}
                                            {!selectedServiceName && (
                                                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                                    <Globe className="w-3 h-3" /> +{country.phoneCode}
                                                </div>
                                            )}

                                            {/* Stock Tag (Always show if context exists) */}
                                            {selectedServiceName && (
                                                <div className={cn(
                                                    "flex items-center gap-1 text-[10px]",
                                                    (country.totalStock || 0) > 0 ? "text-gray-400" : "text-red-400/70"
                                                )}>
                                                    <BarChart2 className="w-3 h-3" />
                                                    {(country.totalStock || 0) > 1000 ? '1k+' : (country.totalStock || 0)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Active Check */}
                                {isSelected && (
                                    <div className="absolute top-1 right-1">
                                        <div className="w-4 h-4 rounded-full bg-[hsl(var(--neon-lime))] flex items-center justify-center">
                                            <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                                        </div>
                                    </div>
                                )}
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Load More Sentinel */}
            {
                hasMore && (
                    <div ref={loadMoreRef} className="col-span-full py-8 flex justify-center items-center">
                        {loadingMore && <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-lime))]" />}
                    </div>
                )
            }

            {
                filteredCountries.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                        <Search className="w-10 h-10 mb-3 opacity-20" />
                        <p className="text-sm">No countries found for "{searchTerm}"</p>
                    </div>
                )
            }
        </section >
    );
}
