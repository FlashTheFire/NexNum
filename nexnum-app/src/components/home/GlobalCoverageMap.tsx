"use client"

import { useState, useRef, useEffect } from "react"
import { motion, useInView, AnimatePresence, animate } from "framer-motion"
import { useTranslations, useLocale } from "next-intl"
import Link from "next/link"
import useSWR from "swr"
import { SafeImage } from "@/components/ui/safe-image"

// Types for API response
interface CountryNode {
    code: string
    name: string
    flagUrl: string
    totalServices: number
    totalStock: number
    totalProviders: number
    lowestPrice: number
    avgPrice: number
    x: number
    y: number
}

interface CountryStatsResponse {
    countries: CountryNode[]
    summary: {
        totalCountries: number
        totalServices: number
        grandTotalStock: number
    }
}

// Fetcher for SWR
const fetcher = (url: string) => fetch(url).then(res => res.json())

// Format large numbers for display
function formatStock(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`
    return num.toString()
}

function DotMatrixMap() {
    return (
        <div className="absolute inset-0">
            {/* Fallback pattern background */}
            <div className="absolute inset-0 opacity-20"
                style={{
                    backgroundImage: "radial-gradient(circle, #3b82f6 1px, transparent 1px)",
                    backgroundSize: "20px 20px"
                }}
            />
            <SafeImage
                src="/images/world-map-dotmatrix.png"
                fallbackSrc="" // No fallback, just hide
                alt="World Map"
                className="relative w-full h-full object-cover opacity-70"
                style={{ filter: "brightness(1.1) contrast(1.05)" }}
                hideOnError
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0c] via-transparent to-[#0a0a0c] opacity-80 md:opacity-100" />
        </div>
    )
}

function CountryNodeComponent({ node, index, onHover, isHovered, hideIfNotSelected = false, isGlobalLoading = false }: {
    node: CountryNode,
    index: number,
    onHover: (id: string | null) => void,
    isHovered: boolean,
    hideIfNotSelected?: boolean,
    isGlobalLoading?: boolean
}) {
    const t = useTranslations('globalCoverage.stats')
    const handleTap = () => {
        onHover(isHovered ? null : node.code)
    }

    // Dynamic positioning based on quadrant
    const isUpperHalf = node.y < 45
    const isLeftHalf = node.x < 50

    const verticalClass = isUpperHalf ? "top-full mt-2 md:mt-3" : "bottom-full mb-2 md:mb-3"
    const horizontalClass = isLeftHalf ? "left-0" : "right-0"
    const positionClass = `${verticalClass} ${horizontalClass}`

    // Get flag URL
    const flagUrl = node.flagUrl || `/flags/${node.code.toLowerCase()}.svg`

    // Hide if wheel scrolling and not the selected one
    const shouldHide = hideIfNotSelected && !isHovered;

    return (
        <motion.div
            className={`absolute cursor-pointer -translate-x-1/2 -translate-y-1/2 ${isHovered ? "z-50" : "z-20"} ${shouldHide ? "opacity-50 scale-90" : ""}`}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
                duration: 0.5,
                delay: index * 0.1,
                type: "spring",
                stiffness: 260,
                damping: 20
            }}
            onMouseEnter={() => onHover(node.code)}
            onMouseLeave={() => onHover(null)}
            onClick={handleTap}
        >
            {/* Glow effect */}
            <div className={`absolute -inset-3 rounded-full transition-all duration-300 ${isHovered ? "bg-[hsl(var(--neon-lime)/0.4)] md:bg-purple-500/40 blur-xl scale-150" : "bg-[hsl(var(--neon-lime)/0.2)] md:bg-purple-500/20 blur-lg"}`} />

            {/* Flag circle */}
            <div className={`relative w-6 h-6 md:w-8 md:h-8 rounded-full overflow-hidden border-2 transition-all duration-300 ${isHovered
                ? "border-[hsl(var(--neon-lime))] md:border-purple-400 scale-125 shadow-[0_0_20px_rgba(198,255,0,0.5)] md:shadow-[0_0_20px_rgba(168,85,247,0.5)]"
                : "border-white/20 shadow-lg"}`}>
                <SafeImage src={flagUrl} fallbackSrc="/flags/un.svg" alt={node.name} className="w-full h-full object-cover" />
            </div>

            {/* Pulse ring - desktop only */}
            <motion.div
                className="absolute -inset-1 rounded-full border border-purple-400/50 hidden md:block"
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{
                    duration: (isHovered || isGlobalLoading) ? 1.5 : 25,
                    repeat: Infinity,
                    delay: index * 0.05,
                    ease: "linear"
                }}
            />

            {/* Hover/Tap card */}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0, y: isUpperHalf ? -10 : 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: isUpperHalf ? -5 : 5, scale: 0.95 }}
                        transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 25 }}
                        className={`absolute z-50 min-w-[130px] md:min-w-[160px] ${positionClass}`}
                    >
                        <div className="bg-[#0f0f11]/90 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl relative min-w-[180px] md:min-w-[220px]">
                            {/* Glass Light Reflection */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />

                            {/* Header */}
                            <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-3 border-b border-white/[0.06] bg-white/[0.02]">
                                <div className="relative">
                                    <div className="absolute -inset-1 bg-white/10 rounded-full blur-[2px]" />
                                    <SafeImage src={flagUrl} fallbackSrc="/flags/un.svg" alt={node.name} className="relative w-4 h-4 md:w-5 md:h-5 rounded-full object-cover shadow-sm" />
                                </div>
                                <span className="text-white font-semibold text-xs md:text-sm tracking-wide truncate flex-1">{node.name}</span>

                                <Link href="/dashboard/buy" className="ml-2 p-1.5 rounded-lg bg-[hsl(var(--neon-lime)/0.1)] border border-[hsl(var(--neon-lime)/0.3)] hover:bg-[hsl(var(--neon-lime)/0.2)] text-[hsl(var(--neon-lime))] transition-colors flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shopping-cart w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden="true">
                                        <circle cx="8" cy="21" r="1"></circle>
                                        <circle cx="19" cy="21" r="1"></circle>
                                        <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
                                    </svg>
                                </Link>
                            </div>

                            {/* Stats Grid - Updated with real data */}
                            <div className="grid grid-cols-2 divide-x divide-white/[0.06] bg-black/40">
                                <div className="flex flex-col items-center py-2 md:py-3 px-2">
                                    <span className="text-[8px] md:text-[10px] text-gray-500 uppercase font-medium mb-0.5 md:mb-1 tracking-wider">{t('stock')}</span>
                                    <span className="text-white font-bold text-[10px] md:text-xs">{formatStock(node.totalStock)}</span>
                                </div>
                                <div className="flex flex-col items-center py-2 md:py-3 px-2">
                                    <span className="text-[8px] md:text-[10px] text-gray-500 uppercase font-medium mb-0.5 md:mb-1 tracking-wider">{t('services')}</span>
                                    <span className="text-[hsl(var(--neon-lime))] font-bold text-[10px] md:text-xs">{node.totalServices}+</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-white/[0.06] bg-black/40 border-t border-white/[0.04]">
                                <div className="flex flex-col items-center py-2 md:py-3 px-2">
                                    <span className="text-[8px] md:text-[10px] text-gray-500 uppercase font-medium mb-0.5 md:mb-1 tracking-wider">{t('from')}</span>
                                    <span className="text-emerald-400 font-bold text-[10px] md:text-xs">${node.lowestPrice.toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col items-center py-2 md:py-3 px-2">
                                    <span className="text-[8px] md:text-[10px] text-gray-500 uppercase font-medium mb-0.5 md:mb-1 tracking-wider">{t('providers')}</span>
                                    <span className="text-blue-400 font-bold text-[10px] md:text-xs">{node.totalProviders}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

// Sound Synthesis for Scroll Click
let audioCtx: AudioContext | null = null;

const playClickSound = () => {
    // Lazy init audio context
    if (!audioCtx) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
        }
    }
    if (!audioCtx) return;

    const t = audioCtx.currentTime;

    // 1. Low thud (Body of the click)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1, t);
    osc1.frequency.exponentialRampToValueAtTime(1, t + 0.005);

    gain1.gain.setValueAtTime(0.4, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.005);

    osc1.start(t);
    osc1.stop(t + 0.005);

    // 2. High click (Crispness)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(800, t);
    osc2.frequency.exponentialRampToValueAtTime(400, t + 0.02);

    gain2.gain.setValueAtTime(0.1, t);
    gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.02);

    osc2.start(t);
    osc2.stop(t + 0.02);

    // 3. Resume if suspended (browser policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

const WHEEL_ITEM_HEIGHT = 48; // Height of each wheel item
const VISIBLE_ITEMS = 5; // Start/End fade range count

function CountryWheel({ countries, selectedCode, onSelect }: {
    countries: CountryNode[],
    selectedCode: string | null,
    onSelect: (code: string) => void
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isScrolling = useRef(false);
    const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
    const lastPlayedIndex = useRef<number>(-1);

    // Removed: Auto-scroll to selected item when map is hovered
    // The wheel now operates independently from map hover

    // Handle scroll to detect centered item
    const handleScroll = () => {
        if (!containerRef.current) return;
        isScrolling.current = true;

        const scrollTop = containerRef.current.scrollTop;
        const centerIndex = Math.round(scrollTop / WHEEL_ITEM_HEIGHT);

        // Play sound if we crossed an item boundary
        if (centerIndex !== lastPlayedIndex.current) {
            playClickSound();
            lastPlayedIndex.current = centerIndex;
        }

        // Debounce selection update to avoid rapid firing during inertia
        // For smoother UX, we can select immediately if needed, but debouncing is safer for heavy map updates
        if (countries[centerIndex]) {
            if (countries[centerIndex].code !== selectedCode) {
                onSelect(countries[centerIndex].code);
            }
        }

        // Reset scrolling flag after delay
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        scrollTimeout.current = setTimeout(() => {
            isScrolling.current = false;
        }, 150);
    };

    return (
        <div className="relative h-[240px] w-[160px] hidden md:flex flex-col items-center justify-center select-none">
            {/* Selection Highlight / Lens */}
            <div className="absolute top-1/2 left-0 right-0 h-[48px] -translate-y-1/2 bg-[hsl(var(--neon-lime)/0.05)] border-y border-[hsl(var(--neon-lime)/0.3)] z-10 pointer-events-none shadow-[0_0_15px_rgba(198,255,0,0.1)]" />

            {/* Top Fade Gradient */}
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-[#0a0a0c] to-transparent z-20 pointer-events-none" />

            {/* Bottom Fade Gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0a0a0c] to-transparent z-20 pointer-events-none" />

            {/* Scroll Container */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="w-full h-full overflow-y-auto no-scrollbar snap-y snap-mandatory py-[96px]" // py to allow top/bottom items to reach center
                style={{ scrollBehavior: 'smooth' }}
            >
                {countries.map((country, index) => {
                    const isSelected = country.code === selectedCode;

                    return (
                        <div
                            key={country.code}
                            onClick={() => onSelect(country.code)}
                            className={`h-[48px] flex items-center px-4 snap-center cursor-pointer transition-all duration-300 transform perspective-500 group ${isSelected ? 'opacity-100 scale-100 translate-x-2' : 'opacity-40 scale-90 hover:opacity-70'}`}
                        >
                            {/* Flag */}
                            <div className={`relative w-6 h-6 rounded-full overflow-hidden border mr-3 transition-all duration-500 ease-out ${isSelected ? 'border-[hsl(var(--neon-lime))] shadow-[0_0_10px_hsl(var(--neon-lime)/0.5)]' : 'border-white/10 grayscale'}`}>
                                <SafeImage src={country.flagUrl} fallbackSrc="/flags/un.svg" alt={country.name} className="w-full h-full object-cover" />
                            </div>

                            {/* Name & Stock */}
                            <div className="flex flex-col min-w-0">
                                <span className={`text-sm font-bold tracking-wide transition-colors truncate ${isSelected ? 'text-white' : 'text-white/60'}`}>
                                    {country.name}
                                </span>
                                {isSelected && (
                                    <span className="text-[9px] text-[hsl(var(--neon-lime))] font-mono">
                                        {formatStock(country.totalStock)} STOCK
                                    </span>
                                )}
                            </div>

                            {/* Active Indicator Dot */}
                            {isSelected && (
                                <motion.div
                                    layoutId="wheel-active-dot"
                                    className="absolute right-6 w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))] shadow-[0_0_8px_hsl(var(--neon-lime))]"
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function GlobalCoverageMap() {
    const [hoveredNode, setHoveredNode] = useState<string | null>(null)
    const [isMounted, setIsMounted] = useState(false)
    const [wheelLocked, setWheelLocked] = useState(false) // Lock to prevent loop during scroll
    const [isWheelScrolling, setIsWheelScrolling] = useState(false) // Track if we're actively scrolling wheel
    const containerRef = useRef<HTMLDivElement>(null)
    const t = useTranslations('globalCoverage')
    const locale = useLocale()

    // Fetch real data from API
    // Increased limit to 300 to ensure full coverage
    const { data, error, isLoading } = useSWR<CountryStatsResponse>(
        `/api/public/stats/countries?limit=300&locale=${locale}`,
        fetcher,
        {
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            dedupingInterval: 300000, // 5 minutes
        }
    )

    useEffect(() => { setIsMounted(true) }, [])

    const countryNodes = data?.countries || []
    const summary = data?.summary || { totalCountries: 0, totalServices: 0, grandTotalStock: 0 }

    // Handler for Wheel Selection
    const handleWheelSelect = (code: string) => {
        setWheelLocked(true); // Signal that this update comes from wheel
        setIsWheelScrolling(true); // Show only selected country on map
        setHoveredNode(code);
        // Unlock after animation frame
        setTimeout(() => {
            setWheelLocked(false);
            setIsWheelScrolling(false);
        }, 300);
    }

    // Handler for Map Selection (Hover)
    const handleMapHover = (code: string | null) => {
        // Only update if not currently being driven by the wheel to avoid fighting
        if (!wheelLocked) {
            setHoveredNode(code);
        }
    }

    if (!isMounted) return <section className="py-24 lg:py-32 bg-[#0a0a0c] min-h-[600px]" />

    return (
        <section ref={containerRef} className="relative py-16 md:py-24 lg:py-32 overflow-hidden bg-[#0a0a0c]">
            {/* Background gradients */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Grid - smaller on mobile */}
                <div className="absolute inset-0 opacity-[0.02] md:opacity-[0.03]" style={{ backgroundImage: `linear-gradient(rgba(168, 85, 247, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(168, 85, 247, 0.3) 1px, transparent 1px)`, backgroundSize: '40px 40px', }} />
            </div>

            <div className="relative z-10 max-w-9xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center max-w-full md:max-w-5xl mx-auto mb-10 md:mb-16 lg:mb-20">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[hsl(var(--neon-lime)/0.1)] border border-[hsl(var(--neon-lime)/0.2)] mb-4 md:mb-6">
                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))] animate-pulse" />
                        <span className="text-[10px] md:text-xs font-bold text-[hsl(var(--neon-lime))] uppercase tracking-[0.2em]">
                            {t('badge')}
                        </span>
                    </div>

                    <div className="relative">
                        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black tracking-tighter leading-[1.1] flex flex-col md:flex-row md:flex-nowrap items-center justify-center gap-y-2 md:gap-x-4 md:gap-y-0 uppercase md:whitespace-nowrap">
                            {(() => {
                                const title = t('title') || 'Global Provider Coverage';
                                const words = title.split(' ');

                                return (
                                    <>
                                        {/* Word 1: Usually "GLOBAL" */}
                                        {words[0] && (
                                            <div className="relative inline-block">
                                                <span className="absolute -left-5 sm:-left-4 top-0 blur-[0.4px] opacity-25 text-white select-none scale-x-105 origin-right mix-blend-screen" aria-hidden="true">
                                                    {words[0][0]}
                                                </span>
                                                <span className="relative bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/60 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]">
                                                    {words[0]}
                                                </span>
                                            </div>
                                        )}

                                        {/* Group for Provider + Coverage to stay together on mobile */}
                                        {(words[1] || words[2]) && (
                                            <div className="flex flex-row items-center justify-center gap-x-3 md:gap-x-4">
                                                {/* Word 2: Usually "PROVIDER" */}
                                                {words[1] && (
                                                    <div className="relative inline-block">
                                                        <span className="absolute -left-5 sm:-left-4 top-0 blur-[0.4px] opacity-25 text-[hsl(var(--neon-lime))] select-none scale-x-105 origin-right" aria-hidden="true">
                                                            {words[1][0]}
                                                        </span>
                                                        <span className="relative bg-clip-text text-transparent bg-[hsl(var(--neon-lime))] drop-shadow-[0_0_15px_rgba(168,85,247,0.25)]">
                                                            {words[1]}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Word 3+: Usually "COVERAGE" */}
                                                {words.slice(2).length > 0 && (
                                                    <div className="relative inline-block">
                                                        <span className="absolute -left-5 sm:-left-4 top-0 blur-[0.4px] opacity-25 text-blue-500 select-none scale-x-105 origin-right hidden md:block" aria-hidden="true">
                                                            {words.slice(2).join(' ')[0]}
                                                        </span>
                                                        <span className="relative bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600 md:drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                                            {words.slice(2).join(' ')}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </h2>
                    </div>
                    <p className="text-sm sm:text-base lg:text-lg font-medium leading-relaxed text-zinc-400/90 max-w-3xl mx-auto">
                        {t('subtitle')}
                    </p>
                </motion.div>

                {/* Main Content Layout */}
                <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:pl-32">

                    {/* Map container */}
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 }} className="relative flex-1 w-full aspect-[1.8/1] md:aspect-[2/1] lg:aspect-[2.5/1] rounded-2xl md:rounded-[32px] bg-[#0c0e14]/80 backdrop-blur-xl border border-white/[0.05] overflow-hidden shadow-2xl group max-w-8xl">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-blue-500/5 z-0" />

                        {/* Inner wrapper with fixed aspect ratio to match the image source (1526x608 ~= 2.51)
                            This ensures coordinates (%,%) always line up with the image content regardless of outer container cropping */}
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full aspect-[1526/608] z-20"
                            onClick={() => setHoveredNode(null)}
                        >
                            <DotMatrixMap />

                            {/* Country nodes - Real data */}
                            {countryNodes.map((node, i) => (
                                <CountryNodeComponent
                                    key={node.code}
                                    node={node}
                                    index={i}
                                    onHover={handleMapHover}
                                    isHovered={hoveredNode === node.code}
                                    hideIfNotSelected={isWheelScrolling}
                                    isGlobalLoading={isLoading}
                                />
                            ))}

                            {/* Live stats badge - MOVED INSIDE WRAPPER FOR VISIBILITY */}
                            <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center gap-2 z-10 select-none pointer-events-none">
                                <motion.span
                                    className="w-2 h-2 rounded-full bg-emerald-500"
                                    animate={{ opacity: [1, 0.4, 1] }}
                                    transition={{ duration: (isLoading || !!hoveredNode) ? 1.5 : 8, repeat: Infinity }}
                                />
                                <span className="text-[10px] md:text-xs text-gray-100 font-bold whitespace-nowrap tracking-wide leading-none">
                                    <span className="text-white">{summary.totalCountries}+</span> Countries • <span className="text-white">{formatStock(summary.grandTotalStock)}</span> Stock
                                </span>
                            </div>
                        </div>

                        {/* Corners (on top of map) */}
                        <div className="absolute top-2 md:top-4 left-2 md:left-4 w-6 md:w-8 h-6 md:h-8 border-l-2 border-t-2 border-[hsl(var(--neon-lime)/0.3)] rounded-tl-lg z-30" />
                        <div className="absolute top-2 md:top-4 right-2 md:right-4 w-6 md:w-8 h-6 md:h-8 border-r-2 border-t-2 border-[hsl(var(--neon-lime)/0.3)] rounded-tr-lg z-30" />
                        <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 w-6 md:w-8 h-6 md:h-8 border-l-2 border-b-2 border-white/10 rounded-bl-lg z-30" />
                        <div className="absolute bottom-2 md:bottom-4 right-2 md:right-4 w-6 md:w-8 h-6 md:h-8 border-r-2 border-b-2 border-white/10 rounded-br-lg z-30" />


                    </motion.div>

                    {/* Right Side: Pro Country Wheel (Desktop Only) */}
                    <div className="hidden md:block">
                        <CountryWheel
                            countries={countryNodes}
                            selectedCode={hoveredNode}
                            onSelect={handleWheelSelect}
                        />
                    </div>

                </div>

                {/* Interaction hint */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.6 }}
                    className="flex justify-center mt-4 text-[10px] text-gray-500 font-medium uppercase tracking-widest"
                >
                    Tap flags or scroll wheel to explore
                </motion.div>
            </div>
        </section>
    )
}
