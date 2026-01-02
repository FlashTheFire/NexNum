import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { ServiceIcon } from "./ServiceIcon";

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
    id: string; // The search term (Canonical Name)
    name: string; // Display Name
    color?: string;
    popular?: boolean;
    providerCount?: number;
}

interface ServiceSelectorProps {
    selectedService: string | null;
    onSelect: (id: string, name: string) => void;
    searchTerm: string;
}

export default function ServiceSelector({ selectedService, onSelect, searchTerm }: ServiceSelectorProps) {
    const [fetchedServices, setFetchedServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(false); // Initial load or search load
    const [loadingMore, setLoadingMore] = useState(false); // Pagination load

    // Pagination State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Debounce or just rely on parent searchTerm? 
    // Parent should ideally debounce 'searchTerm', but for now we assume it triggers useEffect.

    // Reset when search term changes
    useEffect(() => {
        setFetchedServices([]);
        setPage(1);
        setHasMore(true);
        // We trigger fetch via logic below, or explicit call? 
        // Explicit call is safer to avoid race conditions with 'page' state.
        fetchServices(1, searchTerm, true);
    }, [searchTerm]);

    // Fetch Function
    const fetchServices = async (pageToFetch: number, query: string, isReset: boolean) => {
        if (isReset) setLoading(true);
        else setLoadingMore(true);

        try {
            const res = await fetch(`/api/public/services?page=${pageToFetch}&limit=24&q=${encodeURIComponent(query)}`);
            const data = await res.json();

            // Handle { items, pagination } or fallback
            // We implemented { items, pagination } in backend
            const items = data.items || [];
            const meta = data.pagination || {};

            const mapped: Service[] = items.map((item: any) => {
                const lowerName = item.searchName.toLowerCase();
                const isPopular = item.providerCount > 1 || ['whatsapp', 'telegram', 'google', 'openai'].some((p: string) => lowerName.includes(p));

                return {
                    id: item.searchName,
                    name: item.displayName,
                    color: MOCK_COLORS[lowerName.split(' ')[0]] || "#888888",
                    popular: isPopular,
                    providerCount: item.providerCount
                };
            });

            if (isReset) {
                setFetchedServices(mapped);
            } else {
                setFetchedServices(prev => {
                    // Avoid duplicates just in case
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
            fetchServices(nextPage, searchTerm, false);
        }
    }, [isIntersecting, hasMore, loading, loadingMore, page, searchTerm]);

    if (loading && fetchedServices.length === 0) {
        return (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3 py-6">
                {[...Array(16)].map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl bg-white/5 animate-pulse border border-white/5" />
                ))}
            </div>
        );
    }

    return (
        <section className="py-6 min-h-[400px]">
            {/* Grid Layout */}
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3 lg:gap-4 content-start">
                <AnimatePresence mode="popLayout">
                    {fetchedServices.map((service) => {
                        const isSelected = selectedService === service.id;
                        return (
                            <motion.button
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={service.id}
                                onClick={() => onSelect(service.id, service.name)}
                                style={{ '--brand-color': service.color } as React.CSSProperties}
                                className={cn(
                                    "relative flex flex-col items-center justify-center p-3 aspect-square rounded-xl border transition-all duration-300 group overflow-hidden bg-gradient-to-br",
                                    isSelected
                                        ? "from-[hsl(var(--neon-lime)/0.1)] to-transparent border-[hsl(var(--neon-lime))] shadow-[0_0_15px_hsl(var(--neon-lime)/0.2)]"
                                        : "from-white/5 to-white/[0.02] border-white/10 hover:border-white/25 hover:from-white/10"
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
                                {service.popular && !isSelected && (
                                    <div className="absolute top-1 right-1 z-10 opacity-50 group-hover:opacity-100 transition-opacity">
                                        <Sparkles className="w-3 h-3 text-yellow-400" />
                                    </div>
                                )}

                                <div className="relative z-10 mb-2 group-hover:scale-110 transition-transform duration-300">
                                    <ServiceIcon
                                        id={service.name.toLowerCase()}
                                        className={cn(
                                            "w-7 h-7 sm:w-9 sm:h-9 transition-colors",
                                            isSelected
                                                ? "text-[hsl(var(--neon-lime))]"
                                                : "text-gray-400 group-hover:text-white"
                                        )}
                                    />
                                </div>

                                <span className={cn(
                                    "text-[10px] sm:text-xs font-medium text-center leading-tight line-clamp-2 w-full px-1 transition-colors",
                                    isSelected ? "text-white" : "text-gray-400 group-hover:text-white"
                                )}>
                                    {service.name}
                                </span>
                            </motion.button>
                        );
                    })}
                </AnimatePresence>
            </div>

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
