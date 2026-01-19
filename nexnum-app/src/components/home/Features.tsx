"use client";

import { Globe, Shield, Zap, CreditCard, Code, History, LucideIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

interface FeatureCardProps {
    icon: LucideIcon;
    title: string;
    description: string;
    index: number;
    accentColor?: string;
    isActive?: boolean;
    learnMore: string;
}

function FeatureCard({ icon: Icon, title, description, index, accentColor = "hsl(var(--neon-lime))", isActive = false, learnMore }: FeatureCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
                duration: 0.5,
                delay: index * 0.08,
                ease: [0.25, 0.46, 0.45, 0.94]
            }}
            whileHover={{
                y: -8,
                scale: 1.02,
                transition: { duration: 0.25, ease: "easeOut" }
            }}
            whileTap={{ scale: 0.98 }}
            className={`group relative h-full transition-transform duration-300 ${isActive ? 'lg:scale-100 scale-105 -translate-y-1 z-10' : 'z-0'}`}
        >
            {/* Card */}
            <div
                className={`relative h-full p-5 lg:p-7 rounded-2xl overflow-hidden transition-all duration-300
                    bg-gradient-to-br from-white/[0.05] to-white/[0.02]
                    border ${isActive ? 'border-[hsl(var(--neon-lime)/0.4)] shadow-[0_8px_30px_rgba(198,255,0,0.15)] lg:border-white/[0.08] lg:shadow-none' : 'border-white/[0.08]'}
                    hover:border-[hsl(var(--neon-lime)/0.3)]
                    hover:shadow-[0_8px_40px_rgba(0,0,0,0.4),0_0_0_1px_rgba(198,255,0,0.1)]
                    focus-within:ring-2 focus-within:ring-[hsl(var(--neon-lime)/0.5)] focus-within:ring-offset-2 focus-within:ring-offset-[#0a0a0c]`}
                style={{
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                }}
            >
                {/* Noise texture overlay */}
                <div
                    className="absolute inset-0 opacity-[0.015] pointer-events-none"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                    }}
                />

                {/* Inset border highlight */}
                <div className="absolute inset-[1px] rounded-[15px] border border-white/[0.04] pointer-events-none" />

                {/* Gradient accent on hover or active */}
                <div
                    className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${isActive ? 'opacity-100' : ''}`}
                    style={{
                        background: `radial-gradient(circle at 30% 20%, ${accentColor.replace(')', '/0.08)')}, transparent 50%)`
                    }}
                />

                {/* Icon container */}
                <div
                    className={`relative w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300
                        bg-gradient-to-br from-white/[0.08] to-white/[0.03]
                        border border-white/[0.08]
                        group-hover:border-[hsl(var(--neon-lime)/0.4)]
                        group-hover:shadow-[0_0_20px_rgba(198,255,0,0.15)]
                        ${isActive ? 'border-[hsl(var(--neon-lime)/0.4)] shadow-[0_0_20px_rgba(198,255,0,0.15)]' : ''}`}
                >
                    <Icon
                        className={`w-5 h-5 text-[hsl(var(--neon-lime))] transition-transform duration-300 group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}
                        strokeWidth={1.5}
                    />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-white mb-2 tracking-tight">
                    {title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                    {description}
                </p>

                {/* Optional micro-CTA */}
                <div className={`mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isActive ? 'opacity-100' : ''}`}>
                    <span className="text-xs font-medium text-[hsl(var(--neon-lime))] flex items-center gap-1 cursor-pointer hover:gap-2 transition-all">
                        {learnMore}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </span>
                </div>
            </div>
        </motion.div>
    );
}

const featureKeys = ['instantActivation', 'globalCoverage', 'privateSecure', 'flexiblePayment', 'developerAPI', 'smsHistory'] as const;
const featureIcons = [Zap, Globe, Shield, CreditCard, Code, History];

export default function Features() {
    const [activeIndex, setActiveIndex] = useState(0);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [isHovering, setIsHovering] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const t = useTranslations('features');
    const tc = useTranslations('common');

    // Get card dimensions based on viewport
    const getCardDimensions = useCallback(() => {
        if (typeof window === 'undefined') return { cardWidth: 280, gap: 16, padding: 16 };
        const width = window.innerWidth;
        if (width >= 1536) return { cardWidth: 420, gap: 24, padding: 128 }; // 2xl: px-32
        if (width >= 1280) return { cardWidth: 420, gap: 24, padding: 96 }; // xl: px-24
        if (width >= 1024) return { cardWidth: 380, gap: 24, padding: 64 }; // lg: px-16
        if (width >= 640) return { cardWidth: 320, gap: 16, padding: 32 }; // sm: px-8
        return { cardWidth: 280, gap: 16, padding: 16 }; // mobile: px-4
    }, []);

    // Update scroll button states
    const updateScrollState = useCallback(() => {
        if (scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const scrollLeft = container.scrollLeft;
            const maxScroll = container.scrollWidth - container.clientWidth;

            setCanScrollLeft(scrollLeft > 10);
            setCanScrollRight(scrollLeft < maxScroll - 10);
        }
    }, []);

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const scrollLeft = container.scrollLeft;
            const containerWidth = container.clientWidth;
            const { cardWidth, gap, padding } = getCardDimensions();
            const cardStride = cardWidth + gap;
            // Calculate which card is most centered
            const centerOffset = scrollLeft + (containerWidth / 2) - padding;
            const index = Math.floor(centerOffset / cardStride);
            const safeIndex = Math.min(Math.max(index, 0), featureKeys.length - 1);
            if (safeIndex !== activeIndex) {
                setActiveIndex(safeIndex);
            }
            updateScrollState();
        }
    }, [activeIndex, getCardDimensions, updateScrollState]);

    // Smooth scroll by cards for navigation arrows
    const scrollByCards = useCallback((direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const { cardWidth, gap } = getCardDimensions();
            const scrollAmount = (cardWidth + gap) * (direction === 'left' ? -1 : 1);
            scrollContainerRef.current.scrollBy({
                left: scrollAmount,
                behavior: 'smooth'
            });
        }
    }, [getCardDimensions]);

    const scrollToSlide = useCallback((index: number) => {
        if (scrollContainerRef.current) {
            const { cardWidth, gap } = getCardDimensions();
            const position = index * (cardWidth + gap);
            scrollContainerRef.current.scrollTo({
                left: position,
                behavior: 'smooth'
            });
            setActiveIndex(index);
        }
    }, [getCardDimensions]);

    // Handle horizontal wheel scroll on desktop
    const handleWheel = useCallback((e: WheelEvent) => {
        if (scrollContainerRef.current && window.innerWidth >= 1024) {
            // Only intercept if hovering over the carousel and there's significant horizontal intent
            // or if it's a pure vertical scroll we want to convert
            const container = scrollContainerRef.current;
            const atStart = container.scrollLeft <= 0;
            const atEnd = container.scrollLeft >= container.scrollWidth - container.clientWidth - 5;

            // If we're at the boundaries and scrolling further in that direction, let the page scroll
            if ((atStart && e.deltaY < 0) || (atEnd && e.deltaY > 0)) {
                return;
            }

            // Convert vertical scroll to horizontal
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                container.scrollBy({
                    left: e.deltaY * 1.5,
                    behavior: 'auto'
                });
            }
        }
    }, []);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isHovering) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            scrollByCards('left');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            scrollByCards('right');
        }
    }, [isHovering, scrollByCards]);

    // Setup event listeners
    useEffect(() => {
        const container = scrollContainerRef.current;

        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
            updateScrollState();
        }

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            if (container) {
                container.removeEventListener('wheel', handleWheel);
            }
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleWheel, handleKeyDown, updateScrollState]);

    // Update scroll state on resize
    useEffect(() => {
        const handleResize = () => updateScrollState();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [updateScrollState]);

    return (
        <section id="features" className="relative py-24 lg:py-32 overflow-x-clip overflow-y-visible">
            {/* === PREMIUM ANIMATED BACKGROUND === */}

            {/* Base gradient - dark charcoal */}
            <div className="absolute inset-0 hero-gradient" />

            {/* Film grain texture */}
            <div className="absolute inset-0 film-grain opacity-[0.025]" />

            {/* Vignette effect */}
            <div className="absolute inset-0 vignette" />

            {/* Layered soft radial gradients */}
            <div
                className="absolute top-0 left-1/4 w-[800px] h-[600px] pointer-events-none"
                style={{ background: "radial-gradient(ellipse at center, rgba(198,255,0,0.03) 0%, transparent 50%)" }}
            />
            <div
                className="absolute bottom-0 right-1/4 w-[600px] h-[500px] pointer-events-none"
                style={{ background: "radial-gradient(ellipse at center, rgba(0,180,180,0.025) 0%, transparent 50%)" }}
            />
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] pointer-events-none"
                style={{ background: "radial-gradient(ellipse at center, rgba(198,255,0,0.02) 0%, transparent 60%)" }}
            />

            {/* SVG Background Connectors & Decorative Elements */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                <defs>
                    <linearGradient id="bgLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(198,255,0,0)" />
                        <stop offset="50%" stopColor="rgba(198,255,0,0.15)" />
                        <stop offset="100%" stopColor="rgba(198,255,0,0)" />
                    </linearGradient>
                </defs>

                {/* Dashed connector lines with draw animation */}
                <motion.path
                    d="M 0 200 Q 200 180 400 200 T 800 180"
                    fill="none"
                    stroke="url(#bgLineGradient)"
                    strokeWidth="1"
                    strokeDasharray="8 6"
                    className="dashed-flow opacity-30"
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 2, ease: "easeOut" }}
                />
                <motion.path
                    d="M 100 400 Q 300 350 500 400 T 900 380"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="1"
                    strokeDasharray="4 8"
                    className="dashed-flow opacity-40"
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 2.5, ease: "easeOut", delay: 0.3 }}
                />


                {/* Motion-blur speed lines */}
                <line x1="70%" y1="15%" x2="85%" y2="12%" stroke="rgba(198,255,0,0.08)" strokeWidth="1" />
                <line x1="72%" y1="18%" x2="90%" y2="14%" stroke="rgba(198,255,0,0.05)" strokeWidth="1" />
                <line x1="75%" y1="21%" x2="88%" y2="18%" stroke="rgba(198,255,0,0.03)" strokeWidth="1" />

                <line x1="5%" y1="70%" x2="15%" y2="68%" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                <line x1="8%" y1="73%" x2="18%" y2="71%" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
            </svg>

            {/* Particle dust field */}
            <div className="absolute inset-0 pointer-events-none">
                {[...Array(12)].map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 rounded-full bg-white/10"
                        style={{
                            left: `${10 + (i * 7) % 80}%`,
                            top: `${15 + (i * 11) % 70}%`,
                        }}
                        animate={{
                            y: [0, -30, 0],
                            opacity: [0.1, 0.3, 0.1],
                        }}
                        transition={{
                            duration: 4 + (i % 3),
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.5,
                        }}
                    />
                ))}
            </div>

            {/* Micro dust orbs */}
            <div className="absolute top-[10%] left-[60%] w-1 h-1 rounded-full bg-[hsl(var(--neon-lime)/0.5)] animate-float" />
            <div className="absolute top-[35%] right-[15%] w-0.5 h-0.5 rounded-full bg-white/30 animate-float-delayed" />
            <div className="absolute bottom-[40%] left-[20%] w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime)/0.3)] animate-float-delayed-2" />

            {/* Glassmorphism floating panels */}
            <motion.div
                className="absolute top-[25%] right-[8%] w-20 h-12 rounded-lg hidden lg:block"
                style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    backdropFilter: "blur(8px)",
                }}
                animate={{ y: [0, -8, 0], rotate: [0, 1, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
                className="absolute bottom-[30%] left-[6%] w-16 h-10 rounded-lg hidden lg:block"
                style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    backdropFilter: "blur(6px)",
                }}
                animate={{ y: [0, 6, 0], rotate: [0, -1, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
            />

            {/* Data grid / terminal lines texture */}
            <div className="absolute inset-0 opacity-[0.015] pointer-events-none hidden lg:block"
                style={{
                    backgroundImage: `
                        repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(198,255,0,0.03) 60px, rgba(198,255,0,0.03) 61px),
                        repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.02) 40px, rgba(255,255,255,0.02) 41px)
                    `,
                }}
            />

            {/* Floating app badge placeholders (desaturated) */}
            <motion.div
                className="absolute top-[18%] left-[85%] w-6 h-6 rounded-lg bg-white/[0.03] border border-white/[0.05] hidden xl:block"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
                className="absolute top-[55%] left-[3%] w-5 h-5 rounded-md bg-white/[0.02] border border-white/[0.04] hidden xl:block"
                animate={{ y: [0, 4, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            />

            {/* Accent glow center */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-[hsl(var(--neon-lime)/0.02)] rounded-full blur-[180px] pointer-events-none" />

            <div className="container relative mx-auto px-4 lg:px-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center max-w-2xl mx-auto mb-16 lg:mb-20"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="inline-flex items-center px-3 py-1.5 rounded-full border border-[hsl(var(--neon-lime)/0.3)] bg-[hsl(var(--neon-lime)/0.05)] mb-6"
                    >
                        <span className="text-xs font-medium text-[hsl(var(--neon-lime))] uppercase tracking-wider">
                            {t('title')}
                        </span>
                    </motion.div>

                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 tracking-tight">
                        {t('heading')}
                    </h2>
                    <p className="text-base lg:text-lg text-gray-400 leading-relaxed">
                        {t('description')}
                    </p>
                </motion.div>
            </div>

            {/* Cards Horizontal Carousel - Full Width Break Out */}
            <div
                className="relative w-screen left-1/2 -translate-x-1/2 group/carousel"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
            >
                {/* Desktop Navigation Arrows */}
                <AnimatePresence>
                    {canScrollLeft && (
                        <motion.button
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => scrollByCards('left')}
                            className="hidden lg:flex absolute left-4 xl:left-8 2xl:left-16 top-1/2 -translate-y-1/2 z-20
                                w-12 h-12 xl:w-14 xl:h-14 items-center justify-center rounded-full
                                bg-gradient-to-br from-white/[0.08] to-white/[0.03] backdrop-blur-sm
                                border border-white/[0.1] hover:border-[hsl(var(--neon-lime)/0.4)]
                                hover:bg-white/[0.1] hover:shadow-[0_0_30px_rgba(198,255,0,0.15)]
                                transition-all duration-300 cursor-pointer
                                focus:outline-none focus:ring-2 focus:ring-[hsl(var(--neon-lime)/0.5)] focus:ring-offset-2 focus:ring-offset-[#0a0a0c]"
                            aria-label="Scroll left"
                        >
                            <ChevronLeft className="w-5 h-5 xl:w-6 xl:h-6 text-white/70 group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                        </motion.button>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {canScrollRight && (
                        <motion.button
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => scrollByCards('right')}
                            className="hidden lg:flex absolute right-4 xl:right-8 2xl:right-16 top-1/2 -translate-y-1/2 z-20
                                w-12 h-12 xl:w-14 xl:h-14 items-center justify-center rounded-full
                                bg-gradient-to-br from-white/[0.08] to-white/[0.03] backdrop-blur-sm
                                border border-white/[0.1] hover:border-[hsl(var(--neon-lime)/0.4)]
                                hover:bg-white/[0.1] hover:shadow-[0_0_30px_rgba(198,255,0,0.15)]
                                transition-all duration-300 cursor-pointer
                                focus:outline-none focus:ring-2 focus:ring-[hsl(var(--neon-lime)/0.5)] focus:ring-offset-2 focus:ring-offset-[#0a0a0c]"
                            aria-label="Scroll right"
                        >
                            <ChevronRight className="w-5 h-5 xl:w-6 xl:h-6 text-white/70 group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                        </motion.button>
                    )}
                </AnimatePresence>

                {/* Scroll Fade Edges - Desktop only */}
                <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-24 xl:w-32 bg-gradient-to-r from-[#0a0a0c] to-transparent z-10 pointer-events-none" />
                <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-24 xl:w-32 bg-gradient-to-l from-[#0a0a0c] to-transparent z-10 pointer-events-none" />

                {/* Horizontal Scrollable Carousel */}
                <div
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex overflow-x-auto pb-12 px-4 sm:px-8 lg:px-16 xl:px-24 2xl:px-32 snap-x snap-mandatory scrollbar-hide relative z-10 no-scrollbar scroll-smooth"
                    style={{
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                    }}
                >
                    {featureKeys.map((key, index) => (
                        <div key={index} className="relative flex-shrink-0 w-[280px] sm:w-[320px] lg:w-[380px] xl:w-[420px] snap-center mr-4 lg:mr-6 h-full flex flex-col first:ml-0">
                            {/* Connector lines between cards */}
                            {index < featureKeys.length - 1 && (
                                <motion.div
                                    className="absolute top-1/2 -right-4 lg:-right-6 w-4 lg:w-6 h-[2px] lg:h-[3px] bg-gradient-to-r from-[hsl(var(--neon-lime)/0.4)] to-[hsl(var(--neon-lime)/0.1)] rounded-full"
                                    initial={{ scaleX: 0, opacity: 0 }}
                                    whileInView={{ scaleX: 1, opacity: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
                                />
                            )}

                            <div className="h-[280px] lg:h-[300px]">
                                <FeatureCard
                                    icon={featureIcons[index]}
                                    title={t(`${key}.title`)}
                                    description={t(`${key}.description`)}
                                    index={index}
                                    isActive={index === activeIndex}
                                    learnMore={tc('learnMore')}
                                />
                            </div>
                        </div>
                    ))}

                    {/* Right spacer for proper end padding */}
                    <div className="w-4 sm:w-8 lg:w-16 xl:w-24 2xl:w-32 flex-shrink-0" />
                </div>

                {/* Scroll Indicator & Swipe Hint */}
                <div className="flex flex-col items-center gap-3 mt-6 px-4">
                    {/* Animated Swipe Icon - Mobile only, show if not scrolled much */}
                    <AnimatePresence>
                        {activeIndex < 1 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 0.6, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="lg:hidden flex items-center gap-2 text-[10px] text-gray-500 font-medium uppercase tracking-widest"
                            >
                                <motion.div animate={{ x: [-5, 5, -5] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>←</motion.div>
                                <span>Swipe</span>
                                <motion.div animate={{ x: [-5, 5, -5] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>→</motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Desktop keyboard hint - show when hovering */}
                    <AnimatePresence>
                        {isHovering && activeIndex < 2 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 0.5, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="hidden lg:flex items-center gap-3 text-xs text-gray-500 font-medium"
                            >
                                <span className="flex items-center gap-1.5">
                                    <kbd className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/10 text-[10px] font-mono">←</kbd>
                                    <kbd className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/10 text-[10px] font-mono">→</kbd>
                                </span>
                                <span className="text-gray-600">or scroll</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Pagination Dots with enhanced styling */}
                    <div className="flex justify-center items-center gap-2 lg:gap-2.5">
                        {featureKeys.map((_, i) => (
                            <motion.button
                                key={i}
                                onClick={() => scrollToSlide(i)}
                                whileHover={{ scale: 1.2 }}
                                whileTap={{ scale: 0.9 }}
                                className={`rounded-full transition-all duration-300 ${i === activeIndex
                                    ? 'bg-[hsl(var(--neon-lime))] h-2 lg:h-2.5 w-6 lg:w-8 shadow-[0_0_12px_rgba(198,255,0,0.6)]'
                                    : 'bg-white/10 hover:bg-white/25 h-2 lg:h-2.5 w-2 lg:w-2.5'}`}
                                aria-label={`Go to feature ${i + 1}`}
                            />
                        ))}
                    </div>

                    {/* Enhanced Progress bar for desktop */}
                    <div className="hidden lg:flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-gray-500 font-mono tabular-nums">
                            {String(activeIndex + 1).padStart(2, '0')}
                        </span>
                        <div className="w-32 xl:w-40 h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-[hsl(var(--neon-lime)/0.8)] to-[hsl(var(--neon-lime)/0.4)] rounded-full"
                                animate={{ width: `${((activeIndex + 1) / featureKeys.length) * 100}%` }}
                                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                            />
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono tabular-nums">
                            {String(featureKeys.length).padStart(2, '0')}
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}
