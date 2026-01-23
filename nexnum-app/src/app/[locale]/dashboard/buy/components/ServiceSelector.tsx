import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/utils";
import { Check, Sparkles, Loader2, Server, SearchX, HelpCircle, MessageSquare, Shield, Smartphone, Globe, Zap, Lock, Star } from "lucide-react";
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
    const { pinnedItems, isPinned, togglePin } = usePinnedItems<Service>("pinned_services");

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
                    popular: false,
                    lowestPrice: item.lowestPrice,
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

    // Derived state for services: Merge pinned items and sort
    const sortedServices = useMemo(() => {
        const merged = [...fetchedServices];
        // Add pinned items that are not in the current fetched list
        pinnedItems.forEach(pinned => {
            if (!merged.some(s => s.id === pinned.id)) {
                // Only add if it matches search term (simple client-side filter)
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
    }, [fetchedServices, pinnedItems, isPinned, searchTerm]);

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
                            pinned={isPinned(service.id)}
                            onSelect={onSelect}
                            togglePin={togglePin}
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
                            <motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onSelect('other', 'Other', '/icons/other.png')}
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
                            </motion.button>

                            {/* Quick Help Link - Mobile */}
                            <a href="/support/new-service" className="flex items-center justify-center gap-1.5 mt-3 py-2 text-[11px] text-gray-400 hover:text-[hsl(var(--neon-lime))]">
                                <Server className="w-3 h-3" />
                                <span>Request a new service</span>
                            </a>
                        </div>
                    </div>

                    {/* ===================== DESKTOP LAYOUT ===================== */}
                    <div className="hidden lg:block">
                        <div className="relative w-full">
                            {/* Glass Card */}
                            <div className="relative bg-[#0a0a0c]/80 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-lg overflow-hidden">

                                {/* ===== ANIMATED BACKGROUND VECTORS ===== */}
                                {/* Gradient Orbs */}
                                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-[hsl(var(--neon-lime)/0.08)] via-[hsl(var(--neon-lime)/0.02)] to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
                                <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-gradient-to-tr from-purple-500/5 via-blue-500/3 to-transparent rounded-full blur-3xl" />

                                {/* Decorative SVG Lines */}
                                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.04]" viewBox="0 0 800 400">
                                    <defs>
                                        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                                            <stop offset="50%" stopColor="currentColor" stopOpacity="1" />
                                            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    <path d="M0 100 Q200 50 400 100 T800 100" stroke="url(#lineGrad)" strokeWidth="1" fill="none" className="text-white" />
                                    <path d="M0 200 Q200 150 400 200 T800 200" stroke="url(#lineGrad)" strokeWidth="1" fill="none" className="text-white" />
                                    <path d="M0 300 Q200 250 400 300 T800 300" stroke="url(#lineGrad)" strokeWidth="1" fill="none" className="text-white" />
                                    <circle cx="100" cy="150" r="2" fill="currentColor" className="text-[hsl(var(--neon-lime))]" />
                                    <circle cx="300" cy="80" r="1.5" fill="currentColor" className="text-white/30" />
                                    <circle cx="500" cy="250" r="2" fill="currentColor" className="text-[hsl(var(--neon-lime))]" />
                                    <circle cx="700" cy="120" r="1.5" fill="currentColor" className="text-white/30" />
                                </svg>

                                {/* Grid Pattern */}
                                <div className="absolute inset-0 opacity-[0.015]" style={{
                                    backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                                    backgroundSize: '32px 32px'
                                }} />

                                {/* ===== MAIN CONTENT GRID ===== */}
                                <div className="relative z-10 grid grid-cols-12 gap-6 items-center min-h-[280px]">

                                    {/* Left Column - Content (7 cols) */}
                                    <div className="col-span-7 space-y-5 py-2">
                                        {/* Status Badge with Icon */}
                                        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20">
                                            <div className="relative">
                                                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                                                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                                            </div>
                                            <span className="text-sm font-medium text-amber-300/90">No exact match found</span>
                                        </div>

                                        {/* Heading with Icon */}
                                        <div className="flex items-start gap-4">
                                            <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.2)] to-[hsl(var(--neon-lime)/0.05)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.1)]">
                                                <SearchX className="w-6 h-6 text-[hsl(var(--neon-lime))]" strokeWidth={1.5} />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-bold text-white mb-2">
                                                    Service Not Found
                                                </h2>
                                                <p className="text-sm text-gray-400 leading-relaxed max-w-md">
                                                    {searchTerm ? (
                                                        <>Can't find "<span className="text-[hsl(var(--neon-lime))] font-semibold">{searchTerm}</span>". Use our universal <span className="text-white font-medium">"Other"</span> service instead.</>
                                                    ) : (
                                                        <>Service unavailable. Try our universal <span className="text-white font-medium">"Other"</span> option.</>
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {/* "Other" Service Card */}
                                        <motion.button
                                            whileHover={{ scale: 1.01, x: 3 }}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => onSelect('other', 'Other', '/icons/other.png')}
                                            className="group w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent border border-emerald-500/25 hover:border-emerald-400/50 hover:shadow-[0_4px_30px_hsl(var(--neon-lime)/0.12)] transition-all duration-300"
                                        >
                                            <div className="relative shrink-0">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/40 to-teal-500/20 border border-emerald-400/30 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-400/30 transition-shadow">
                                                    <HelpCircle className="w-5 h-5 text-emerald-300" strokeWidth={2} />
                                                </div>
                                                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[hsl(var(--neon-lime))] rounded-full flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.5)]">
                                                    <Check className="w-3 h-3 text-black" strokeWidth={3} />
                                                </div>
                                            </div>

                                            <div className="flex-1 text-left">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <h4 className="text-base font-bold text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors">Other</h4>
                                                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] rounded border border-[hsl(var(--neon-lime)/0.3)]">Universal</span>
                                                </div>
                                                <p className="text-xs text-gray-400">Works with any website, app, or platform worldwide</p>
                                            </div>

                                            <div className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-[hsl(var(--neon-lime)/0.15)] group-hover:border-[hsl(var(--neon-lime)/0.3)] transition-all">
                                                <svg className="w-4 h-4 text-gray-500 group-hover:text-[hsl(var(--neon-lime))] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                </svg>
                                            </div>
                                        </motion.button>

                                        {/* Help Link */}
                                        <div className="flex items-center gap-3 pt-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                                <Server className="w-3.5 h-3.5 text-blue-400" />
                                            </div>
                                            <div className="text-sm">
                                                <span className="text-gray-400">Missing a service? </span>
                                                <a href="/support/new-service" className="font-medium text-[hsl(var(--neon-lime))] hover:underline">Request it →</a>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column - Professional Illustration (5 cols) */}
                                    <div className="col-span-5 flex items-center justify-center">
                                        <div className="relative w-full max-w-[260px] aspect-square">

                                            {/* Outer Ring with Service Icons */}
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-full h-full rounded-full border border-white/[0.06]" />
                                            </div>

                                            {/* Service Icons - Positioned on the outer ring */}
                                            {/* Top */}
                                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-lg backdrop-blur-sm">
                                                <MessageSquare className="w-4 h-4 text-blue-400" strokeWidth={1.5} />
                                            </div>
                                            {/* Right */}
                                            <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-lg backdrop-blur-sm">
                                                <Globe className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
                                            </div>
                                            {/* Bottom */}
                                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-lg backdrop-blur-sm">
                                                <Shield className="w-4 h-4 text-purple-400" strokeWidth={1.5} />
                                            </div>
                                            {/* Left */}
                                            <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-lg backdrop-blur-sm">
                                                <Smartphone className="w-4 h-4 text-cyan-400" strokeWidth={1.5} />
                                            </div>

                                            {/* Inner Ring */}
                                            <div className="absolute inset-8 flex items-center justify-center">
                                                <div className="w-full h-full rounded-full border border-[hsl(var(--neon-lime)/0.15)]" />
                                            </div>

                                            {/* Diagonal Icons on inner ring */}
                                            {/* Top-Right */}
                                            <div className="absolute top-[15%] right-[15%] w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(var(--neon-lime)/0.15)] to-transparent border border-[hsl(var(--neon-lime)/0.2)] flex items-center justify-center">
                                                <Zap className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" strokeWidth={1.5} />
                                            </div>
                                            {/* Bottom-Left */}
                                            <div className="absolute bottom-[15%] left-[15%] w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(var(--neon-lime)/0.15)] to-transparent border border-[hsl(var(--neon-lime)/0.2)] flex items-center justify-center">
                                                <Lock className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" strokeWidth={1.5} />
                                            </div>

                                            {/* Central Icon Container */}
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#18181b] to-[#0f0f11] border border-white/10 flex items-center justify-center shadow-2xl">
                                                    <div className="relative">
                                                        <SearchX className="w-8 h-8 text-[hsl(var(--neon-lime))]" strokeWidth={1.5} />
                                                        <div className="absolute inset-0 blur-md bg-[hsl(var(--neon-lime)/0.4)] -z-10 scale-150" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Stats Badges */}
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[#151518] border border-white/10 shadow-lg whitespace-nowrap">
                                                <p className="text-[11px] font-semibold text-white">500+ <span className="text-gray-500 font-normal">services</span></p>
                                            </div>
                                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[hsl(var(--neon-lime)/0.1)] border border-[hsl(var(--neon-lime)/0.25)] shadow-lg whitespace-nowrap">
                                                <p className="text-[11px] font-semibold text-[hsl(var(--neon-lime))]">24/7 <span className="text-[hsl(var(--neon-lime)/0.6)] font-normal">support</span></p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </section>
    );
}


