import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, Sparkles, Loader2, Server } from "lucide-react";

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
    id: string; // Service slug
    name: string; // Display Name
    color?: string;
    popular?: boolean;
    lowestPrice?: number;
    countryCount?: number;
    iconUrl?: string;
    flagUrls?: string[];
}

// ... imports

interface ServiceSelectorProps {
    selectedService: string | null;
    onSelect: (id: string, name: string, iconUrl?: string) => void;
    searchTerm: string;
    sortOption: "relevance" | "price_asc" | "stock_desc";
}

export default function ServiceSelector({ selectedService, onSelect, searchTerm, sortOption }: ServiceSelectorProps) {
    const [fetchedServices, setFetchedServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

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
            const data = await res.json();

            // ... (rest of fetch logic unchanged)

            const items = data.items || [];
            const meta = data.pagination || {};

            const mapped: Service[] = items.map((item: any) => {
                const lowerName = item.name?.toLowerCase() || '';
                const isPopular = item.popular ?? (item.serverCount > 2 || ['whatsapp', 'telegram', 'google', 'openai'].some((p: string) => lowerName.includes(p)));

                return {
                    id: item.slug,          // Use slug as id
                    name: item.name,        // Display name
                    color: MOCK_COLORS[lowerName.split(/[\s-]/)[0]] || "#888888",
                    popular: isPopular,
                    lowestPrice: item.lowestPrice,
                    totalStock: item.totalStock,
                    serverCount: item.serverCount,
                    countryCount: item.countryCount,
                    iconUrl: item.iconUrl,
                    flagUrls: item.flagUrls,
                };
            });

            if (isReset) {
                // Prioritize Selected Service (Move to Top)
                if (selectedService) {
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
            {/* Header / Controls */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        Select Service
                    </h3>
                </div>
            </div>

            {/* Grid Layout - 3 cols on mobile for better touch targets */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 content-start"
            >
                <AnimatePresence mode="popLayout">
                    {fetchedServices.map((service, index) => {
                        // ... map logic
                        const isSelected = selectedService === service.id;
                        return (
                            <motion.button
                                layout
                                variants={itemVariants}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={`${service.id}_${index}`}
                                onClick={() => onSelect(service.id, service.name, service.iconUrl)}
                                style={{ '--brand-color': service.color } as React.CSSProperties}
                                className={cn(
                                    "relative flex flex-col items-center justify-center p-3 sm:p-4 aspect-square rounded-2xl border transition-all duration-300 group overflow-hidden",
                                    "backdrop-blur-sm shadow-lg",
                                    isSelected
                                        ? "bg-gradient-to-br from-[hsl(var(--neon-lime)/0.15)] via-[hsl(var(--neon-lime)/0.05)] to-transparent border-[hsl(var(--neon-lime))] shadow-[0_0_20px_hsl(var(--neon-lime)/0.25)]"
                                        : "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border-white/10 hover:border-white/30 hover:from-white/[0.12] hover:shadow-xl"
                                )}
                            >
                                {/* Active Badge */}
                                {isSelected && (
                                    <div className="absolute top-1 right-1 z-20">
                                        <div className="w-4 h-4 rounded-full bg-[hsl(var(--neon-lime))] text-black flex items-center justify-center shadow-sm">
                                            <Check className="w-3 h-3" strokeWidth={3} />
                                        </div>
                                    </div>
                                )}

                                {/* Popular Badge */}
                                {/* Popular Badge */}
                                {service.popular && !isSelected && (
                                    <div className="absolute top-1.5 right-1.5 z-10 animate-in fade-in zoom-in duration-300">
                                        <div className="bg-black/40 backdrop-blur-md rounded-full p-1 border border-white/10 shadow-sm group-hover:border-[hsl(var(--neon-lime)/0.5)] transition-colors">
                                            <Sparkles className="w-3 h-3 text-amber-400 fill-amber-400" />
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
                                        {(service.iconUrl?.includes('dicebear') || !service.iconUrl) ? (
                                            <div className="relative w-full h-full flex items-center justify-center bg-white/5">
                                                {/* Blurred Dynamic Background */}
                                                <img
                                                    src={service.iconUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(service.name)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`}
                                                    alt=""
                                                    className="absolute inset-0 w-full h-full object-cover blur-[2px] scale-150 opacity-50 contrast-125 brightness-110"
                                                />
                                                {/* Custom Overlay Icon */}
                                                <img
                                                    src="/placeholder-icon.png"
                                                    alt={service.name}
                                                    className={cn(
                                                        "relative z-10 w-[70%] h-[70%] object-contain opacity-80 drop-shadow-lg",
                                                        !isSelected && "group-hover:opacity-100 group-hover:scale-105 transition-all"
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

                                {/* Country Flags - Top Left */}
                                {service.flagUrls && service.flagUrls.length > 0 && (
                                    <div className="absolute top-1.5 left-1.5 flex -space-x-1 opacity-60 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110 z-20">
                                        {service.flagUrls.slice(0, 3).map((url, i) => (
                                            <div
                                                key={i}
                                                className="w-4 h-4 rounded-full border-2 border-[#151518] overflow-hidden bg-black/30 shadow-sm"
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

            {fetchedServices.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <p className="text-sm">No services found for "{searchTerm}"</p>
                </div>
            )}
        </section>
    );
}


