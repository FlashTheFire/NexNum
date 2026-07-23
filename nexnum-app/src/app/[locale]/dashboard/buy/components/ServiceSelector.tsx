import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/utils";
import { Check, Loader2, Server, SearchX, HelpCircle, Star } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { PriceDisplay } from "@/components/common/PriceDisplay";

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
    }, [ref, options]); // options change recreates observer

    return { ref, isIntersecting };
}

const MOCK_COLORS: Record<string, string> = {
    whatsapp: "#25D366", telegram: "#26A5E4", google: "#4285F4", facebook: "#1877F2",
    tiktok: "#FE2C55", instagram: "#E4405F", openai: "#10A37F", discord: "#5865F2",
    amazon: "#FF9900", twitter: "#1DA1F2", uber: "#FFFFFF", netflix: "#E50914"
};

export interface Service {
    id: string; // Canonical Service Name (e.g. "WhatsApp")
    name: string; // Display Name
    color?: string;
    popular?: boolean;
    lowestPrice?: number;
    currencyPrices?: Record<string, number>;
    countryCount?: number;
    iconUrl?: string;
    flagUrls?: string[];
}

// ... imports

interface ServiceSelectorProps {
    selectedService: string | null;
    defaultSelected?: { id: string, name: string, iconUrl?: string } | null;
    onSelect: (id: string, name: string, iconUrl?: string) => void;
    searchTerm: string;
    sortOption: "relevance" | "price_asc" | "stock_desc";
}

const ServiceCard = React.memo(({
    service,
    isSelected,
    pinned,
    onSelect,
    togglePin,
    index
}: {
    service: Service;
    isSelected: boolean;
    pinned: boolean;
    onSelect: (id: string, name: string, iconUrl?: string) => void;
    togglePin: (service: Service) => void;
    index: number;
}) => {
    const itemVariants = {
        hidden: { opacity: 0, scale: 0.8 },
        show: { opacity: 1, scale: 1 }
    };

    return (
        <motion.div
            data-testid="service-card"
            variants={itemVariants}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => onSelect(service.id, service.name, service.iconUrl)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    onSelect(service.id, service.name, service.iconUrl);
                }
            }}
            style={{ '--brand-color': service.color, willChange: 'transform' } as React.CSSProperties}
            className={cn(
                "relative flex flex-col items-center justify-center p-3 sm:p-4 aspect-square rounded-2xl border transition-all duration-300 group overflow-hidden cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--neon-lime))] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0c]",
                "backdrop-blur-sm shadow-lg",
                isSelected
                    ? "bg-gradient-to-br from-[hsl(var(--neon-lime)/0.15)] via-[hsl(var(--neon-lime)/0.05)] to-transparent border-[hsl(var(--neon-lime))] shadow-[0_0_20px_hsl(var(--neon-lime)/0.25)]"
                    : pinned
                        ? "bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.1)]"
                        : "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border-white/10 hover:border-white/30 hover:from-white/[0.12] hover:shadow-xl"
            )}
        >
            {/* Pin Button - Top Right */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    togglePin(service);
                }}
                className={cn(
                    "absolute top-1.5 right-1.5 z-30 p-1.5 rounded-full transition-all duration-300",
                    (pinned || isSelected)
                        ? "opacity-100 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 hover:scale-110"
                        : "opacity-0 group-hover:opacity-100 bg-black/40 text-gray-400 hover:text-white hover:bg-black/60 scale-90 hover:scale-100"
                )}
                title={pinned ? "Unpin service" : "Pin sort to top"}
            >
                <Star className={cn("w-3.5 h-3.5", pinned && "fill-yellow-500")} strokeWidth={pinned ? 3 : 2} />
            </button>
            {/* Active Badge - Moved to Bottom Right to avoid overlap */}
            {isSelected && (
                <div className="absolute bottom-1 right-1 z-20">
                    <div className="w-4 h-4 rounded-full bg-[hsl(var(--neon-lime))] text-black flex items-center justify-center shadow-sm">
                        <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                </div>
            )}

            <div className="relative z-10 mt-3 mb-2 w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
                {/* Hover glow ring */}
                <div className={cn(
                    "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-500",
                    "bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-cyan-500/20",
                    "blur-md scale-110 group-hover:scale-125"
                )} />

                {/* Icon container with hover scale */}
                <div className={cn(
                    "relative w-full h-full rounded-xl overflow-hidden transition-all duration-300",
                    "group-hover:scale-110 group-hover:rotate-2",
                    isSelected && "ring-2 ring-[hsl(var(--neon-lime))] ring-offset-2 ring-offset-[#0a0a0c]"
                )}>
                    {(!service.iconUrl || service.iconUrl.includes('dicebear')) ? (
                        <div className="relative w-full h-full flex items-center justify-center bg-white/5">
                            {/* Professional Background Blur for placeholder */}
                            <img
                                src={service.iconUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(service.name)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover blur-[4px] scale-150 opacity-40 contrast-125 brightness-110"
                            />
                            <img
                                src="/placeholder-icon.png"
                                alt={service.name}
                                className={cn(
                                    "relative z-10 w-[60%] h-[60%] object-contain opacity-70 contrast-125 drop-shadow-md",
                                    !isSelected && "group-hover:opacity-100 group-hover:scale-110 transition-all"
                                )}
                            />
                        </div>
                    ) : (
                        <img
                            src={service.iconUrl}
                            alt={service.name}
                            className={cn(
                                "w-full h-full object-contain filter transition-all",
                                "brightness-110 contrast-110",
                                !isSelected && "opacity-90 group-hover:opacity-100"
                            )}
                        />
                    )}
                </div>
            </div>

            {/* Country Flags */}
            {service.flagUrls && service.flagUrls.length > 0 && (
                <div className="absolute top-1.5 left-1.5 flex -space-x-1 opacity-60 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110 z-20">
                    {service.flagUrls.slice(0, 3).map((url, i) => (
                        <div
                            key={i}
                            className="w-3.5 h-3.5 rounded-full border border-[#151518] overflow-hidden bg-black/30 shadow-sm"
                            style={{ zIndex: 3 - i }}
                        >
                            <img src={url} className="w-full h-full object-cover" alt="" />
                        </div>
                    ))}
                </div>
            )}

            <span className={cn(
                "text-[11px] sm:text-xs font-semibold text-center leading-tight line-clamp-2 w-full px-1 transition-colors",
                isSelected ? "text-white" : "text-gray-300 group-hover:text-white"
            )}>
                {service.name}
            </span>
            {service.currencyPrices && (
                <div className={cn("mt-0.5 text-[10px] font-medium opacity-80", isSelected ? "text-[hsl(var(--neon-lime))]" : "text-gray-400 group-hover:text-gray-300")}>
                    from <PriceDisplay currencyPrices={service.currencyPrices} compact />
                </div>
            )}
        </motion.div>
    );
});

ServiceCard.displayName = "ServiceCard";

export default function ServiceSelector({ selectedService, defaultSelected, onSelect, searchTerm, sortOption }: ServiceSelectorProps) {
    const [fetchedServices, setFetchedServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const { isFavorite, favoriteIdOf, toggle: toggleFav } = useFavorites();

    // Reset when search term or sort option changes
    useEffect(() => {
        setFetchedServices([]);
        setPage(1);
        setHasMore(true);
        fetchServices(1, searchTerm, sortOption, true);
    }, [searchTerm, sortOption]);

    // Fetch Function - uses new /api/search/services endpoint
    const fetchServices = async (pageToFetch: number, query: string, sort: string, isReset: boolean) => {
        if (isReset) setLoading(true);
        else setLoadingMore(true);

        try {
            const res = await fetch(`/api/search/services?page=${pageToFetch}&limit=24&q=${encodeURIComponent(query)}&sort=${sort}`);

            if (!res.ok) {
                // Determine if 404/500 to show appropriate log/toast
                console.warn(`[ServiceSelector] API returned ${res.status}: ${res.statusText}`);
                throw new Error(`Service search failed: ${res.status}`);
            }

            let data;
            try {
                data = await res.json();
            } catch (e) {
                // HTML or empty response
                console.error("[ServiceSelector] Failed to parse JSON response", e);
                throw new Error("Invalid API response format");
            }

            // ... (rest of fetch logic unchanged)

            const items = data.items || [];
            const meta = data.pagination || {};

            const mapped: Service[] = items.map((item: any) => {
                const lowerName = item.name?.toLowerCase() || '';
                const isPopular = item.popular ?? (item.serverCount > 2 || ['whatsapp', 'telegram', 'google', 'openai'].some((p: string) => lowerName.includes(p)));

                return {
                    id: item.name,          // Use Name as primary identity
                    name: item.name,        // Display name
                    color: MOCK_COLORS[lowerName.split(/[\s-]/)[0]] || "#888888",
                    popular: false,
                    lowestPrice: item.lowestPrice,
                    currencyPrices: item.currencyPrices || { "USD": item.lowestPrice }, // Use API prices or fallback to legacy USD bridge
                    totalStock: item.totalStock,
                    serverCount: item.serverCount,
                    countryCount: item.countryCount,
                    iconUrl: item.iconUrl,
                    flagUrls: item.flagUrls,
                };
            });

            if (isReset) {
                // Ensure Selected Service is Visible
                if (defaultSelected) {
                    // Normalize IDs for comparison
                    const targetId = defaultSelected.id.toLowerCase();
                    const idx = mapped.findIndex(s => s.id.toLowerCase() === targetId);

                    if (idx > -1) {
                        // Found logic (even if case mismatch): Move to top
                        const [item] = mapped.splice(idx, 1);
                        mapped.unshift(item);
                    } else if (pageToFetch === 1 && !query) {
                        // Not found: Inject
                        const safeColor = defaultSelected.name
                            ? (MOCK_COLORS[defaultSelected.name.toLowerCase().split(/[\s-]/)[0]] || "#888888")
                            : "#888888";

                        mapped.unshift({
                            id: defaultSelected.id, // Keep original casing from selection
                            name: defaultSelected.name,
                            iconUrl: defaultSelected.iconUrl,
                            popular: false,
                            color: safeColor
                        });
                    }
                } else if (selectedService) {
                    // Fallback to old ID-only logic
                    const idx = mapped.findIndex(s => s.id === selectedService);
                    if (idx > -1) {
                        const [item] = mapped.splice(idx, 1);
                        mapped.unshift(item);
                    }
                }
                setFetchedServices(mapped);
            } else {
                setFetchedServices(prev => {
                    const existingIds = new Set(prev.map(s => s.id));
                    const newItems = mapped.filter((s: Service) => !existingIds.has(s.id));
                    return [...prev, ...newItems];
                });
            }

            setHasMore(meta.hasMore ?? (items.length > 0));

        } catch (err) {
            console.error("Failed to load services", err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    // Derived state for services: keep favorites always visible (even if not in current page)
    // and sort favorites to the top.
    const sortedServices = useMemo(() => {
        const merged = [...fetchedServices];
        return merged.sort((a, b) => {
            const aP = isFavorite("SERVICE", a.id);
            const bP = isFavorite("SERVICE", b.id);
            if (aP === bP) return 0;
            return aP ? -1 : 1;
        });
    }, [fetchedServices, isFavorite]);

    // Load More Logic (Infinite Scroll)
    const { ref: loadMoreRef, isIntersecting } = useInView({ threshold: 0.5 });

    useEffect(() => {
        if (isIntersecting && hasMore && !loading && !loadingMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchServices(nextPage, searchTerm, sortOption, false);
        }
    }, [isIntersecting, hasMore, loading, loadingMore, page, searchTerm, sortOption]);

    // ... (variants omitted)
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.02
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, scale: 0.8 },
        show: { opacity: 1, scale: 1 }
    };

    if (loading && fetchedServices.length === 0) {
        return (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 py-6">
                {[...Array(12)].map((_, i) => (
                    <div key={i} className="aspect-square rounded-2xl bg-white/5 animate-pulse border border-white/5" />
                ))}
            </div>
        );
    }

    return (
        <section className="py-2 space-y-4">

            {/* Grid Layout - 3 cols on mobile for better touch targets */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 content-start"
            >
                <AnimatePresence>
                    {sortedServices.map((service, index) => (
                        <ServiceCard
                            key={`${service.id}_${index}`}
                            service={service}
                            isSelected={selectedService === service.id}
                            pinned={isFavorite("SERVICE", service.id)}
                            onSelect={onSelect}
                            togglePin={(s) => { toggleFav("SERVICE", { value: s.id, displayName: s.name, iconUrl: s.iconUrl }); }}
                            index={index}
                        />
                    ))}
                </AnimatePresence>
            </motion.div>

            {/* Load More Sentinel */}
            {hasMore && (
                <div ref={loadMoreRef} className="col-span-full py-8 flex justify-center items-center">
                    {loadingMore && <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-lime))]" />}
                </div>
            )}

            {fetchedServices.length === 0 && !loading && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="col-span-full"
                >
                    {/* ===================== MOBILE LAYOUT ===================== */}
                    <div className="lg:hidden">
                        <div className="relative bg-gradient-to-br from-white/[0.06] to-transparent border border-white/10 rounded-2xl p-4 sm:p-5 backdrop-blur-xl overflow-hidden">
                            {/* Decorative accent */}
                            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-[hsl(var(--neon-lime)/0.12)] to-transparent rounded-bl-full" />

                            {/* Header - Compact */}
                            <div className="relative z-10 flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                                    <SearchX className="w-5 h-5 text-[hsl(var(--neon-lime))]" strokeWidth={1.5} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">Service Not Found</h3>
                                    <p className="text-xs text-gray-500">Try the universal option</p>
                                </div>
                            </div>

                            {/* "Other" Button - Mobile */}
                            <button
                                onClick={() => onSelect('other', 'Other', '/assets/icons/other.png')}
                                className="group w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 active:border-emerald-500/40"
                            >
                                <div className="relative w-11 h-11 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                    <HelpCircle className="w-5 h-5 text-emerald-400" strokeWidth={2} />
                                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
                                </div>
                                <div className="flex-1 text-left">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white">Other</span>
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-400 rounded">Universal</span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Works with any website or app</p>
                                </div>
                                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>

                            {/* Quick Help Link - Mobile */}
                            <a href="/support/new-service" className="flex items-center justify-center gap-1.5 mt-3 py-2 text-[11px] text-gray-400 hover:text-[hsl(var(--neon-lime))]">
                                <Server className="w-3 h-3" />
                                <span>Request a new service</span>
                            </a>
                        </div>
                    </div>

                    {/* ===================== DESKTOP LAYOUT (matches mobile design) ===================== */}
                    <div className="hidden lg:block">
                        <div className="relative bg-gradient-to-br from-white/[0.06] to-transparent border border-white/10 rounded-2xl p-5 backdrop-blur-xl overflow-hidden max-w-md mx-auto">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-[hsl(var(--neon-lime)/0.12)] to-transparent rounded-bl-full" />
                            <div className="relative z-10 flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center">
                                    <SearchX className="w-5 h-5 text-[hsl(var(--neon-lime))]" strokeWidth={1.5} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">Service Not Found</h3>
                                    <p className="text-xs text-gray-500">Try the universal option</p>
                                </div>
                            </div>
                            <button
                                onClick={() => onSelect('other', 'Other', '/assets/icons/other.png')}
                                className="group w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 hover:border-emerald-500/30 transition-colors"
                            >
                                <div className="relative w-11 h-11 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                    <HelpCircle className="w-5 h-5 text-emerald-400" strokeWidth={2} />
                                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
                                </div>
                                <div className="flex-1 text-left">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white">Other</span>
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-400 rounded">Universal</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">Works with any website or app</p>
                                </div>
                                <svg className="w-4 h-4 text-gray-500 group-hover:text-[hsl(var(--neon-lime))] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                            <a href="/support/new-service" className="flex items-center justify-center gap-1.5 mt-3 py-2 text-xs text-gray-400 hover:text-[hsl(var(--neon-lime))]">
                                <Server className="w-3 h-3" />
                                <span>Request a new service</span>
                            </a>
                        </div>
                    </div>
                </motion.div>
            )}
        </section>
    );
}


