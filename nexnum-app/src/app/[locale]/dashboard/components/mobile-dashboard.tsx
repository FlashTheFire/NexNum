"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { useGlobalStore } from "@/stores/appStore"
import { useAuthStore } from "@/stores/authStore"
import { useCurrency } from "@/providers/CurrencyProvider"
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags"
import Link from "next/link"
import {
    Wallet,
    Phone,
    ArrowUpRight,
    Search,
    Bell,
    Plus,
    Clock,
    ShoppingCart,
    MoreHorizontal
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DashboardBackground } from "./dashboard-background"
import { ModernNumberCard, NumberCardSkeleton } from "./ModernNumberCard"
import { PriceDisplay, BalanceDisplay } from "@/components/common/PriceDisplay"
import { TelegramLinkCard } from "@/components/user/TelegramLinkCard"

// Quick Actions Configuration


export function MobileDashboard() {
    const { user } = useAuthStore()
    const { userProfile, activeNumbers, isLoadingNumbers, transactions, totalSpent, totalDeposited } = useGlobalStore()
    const [scrolled, setScrolled] = useState(false)
    const [activeCardIndex, setActiveCardIndex] = useState(0)
    const [isMounted, setIsMounted] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [now, setNow] = useState(Date.now())
    const { formatFromBalance, formatFromPrices } = useCurrency()

    useEffect(() => {
        setIsMounted(true)
        const interval = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [])

    const t = useTranslations('dashboard')

    // Greeting
    const hour = new Date().getHours()
    const greeting = hour < 12 ? t('greeting.morning') : hour < 18 ? t('greeting.afternoon') : t('greeting.evening')

    // Carousel Logic
    const [activeMetric, setActiveMetric] = useState(0)

    const metrics = [
        {
            label: t('stats.balance'),
            value: <BalanceDisplay
                multiBalance={userProfile?.multiBalance}
                className="font-bold"
            />,
            icon: Wallet,
            color: "text-[hsl(var(--neon-lime))]",
            hexColor: "hsl(var(--neon-lime))",
            glowColor: "hsl(var(--neon-lime))"
        },
        {
            label: t('stats.spent'),
            value: <BalanceDisplay
                multiBalance={typeof totalSpent === 'object' ? totalSpent : undefined}
                className="font-bold"
            />,
            icon: ShoppingCart,
            color: "text-purple-400",
            hexColor: "#a78bfa", // purple-400
            glowColor: "#c084fc"
        },
        {
            label: t('stats.deposited'),
            value: <BalanceDisplay
                multiBalance={typeof totalDeposited === 'object' ? totalDeposited : undefined}
                className="font-bold"
            />,
            icon: ArrowUpRight,
            color: "text-emerald-400",
            hexColor: "#34d399", // emerald-400
            glowColor: "#34d399"
        }
    ]

    const ActiveIcon = metrics[activeMetric].icon

    const quickActionsLinks = [
        { label: t('hero.newNumber'), icon: ShoppingCart, href: "/dashboard/buy", color: "text-[hsl(var(--neon-lime))]", bg: "bg-[hsl(var(--neon-lime)/0.1)]" },
        { label: t('quickActions.topUp'), icon: Wallet, href: "/dashboard/wallet", color: "text-cyan-400", bg: "bg-cyan-400/10" },
        { label: t('nav.history'), icon: Clock, href: "/dashboard/history", color: "text-purple-400", bg: "bg-purple-400/10" },
    ]

    return (
        <div className="min-h-screen relative overflow-x-hidden pb-20">
            {/* Background */}
            <DashboardBackground />

            {/* Content Container */}
            <div className="relative z-10 px-4 pt-6 space-y-8">

                {/* 1. Header / Greeting */}
                <header className="flex items-center justify-between">
                    <div>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-sm font-medium text-gray-400"
                        >
                            {greeting},
                        </motion.p>
                        <motion.h1
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-2xl font-bold text-white tracking-tight"
                        >
                            {user?.name?.split(' ')[0] || "Trader"}
                        </motion.h1>
                    </div>


                </header>

                {/* Telegram Link Callout Card */}
                <TelegramLinkCard telegramId={(user as any)?.telegramId} username={(user as any)?.username} />

                {/* 2. Hero Card (3.5D CSS Effect) */}
                {/* 2. Enhanced Hero Card (Premium Mobile) */}
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileTap={{ scale: 0.98 }} // Tactile feedback
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    onClick={() => setActiveMetric((prev) => (prev + 1) % metrics.length)}
                    className="relative w-full aspect-[1.8/1] rounded-[28px] p-[1px] overflow-hidden group cursor-pointer"
                >
                    {/* Living Border Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-[hsl(var(--neon-lime)/0.2)]" />

                    {/* Main Card Body */}
                    <div className="relative h-full w-full bg-[#0f1115] rounded-[27px] overflow-hidden">

                        {/* 1. Dynamic Backgrounds (Changes based on active metric) */}
                        <motion.div
                            animate={{ opacity: activeMetric === 0 ? 1 : 0 }}
                            className="absolute inset-0 bg-gradient-to-br from-[#1a1c22] to-[#0a0c10]"
                        />
                        <motion.div
                            animate={{ opacity: activeMetric === 1 ? 1 : 0 }}
                            className="absolute inset-0 bg-gradient-to-br from-[#1a1222] to-[#0a0c10]"
                        />
                        <motion.div
                            animate={{ opacity: activeMetric === 2 ? 1 : 0 }}
                            className="absolute inset-0 bg-gradient-to-br from-[#121c1a] to-[#0a0c10]"
                        />

                        {/* Subtle Noise */}
                        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")` }} />

                        {/* 2. Ambient Glows (Dynamic Color) */}
                        <motion.div
                            animate={{
                                background: metrics[activeMetric].glowColor,
                                opacity: 0.2
                            }}
                            className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[80px]"
                        />

                        {/* 4. Content Content */}
                        <div className="relative z-10 w-full h-full p-6 flex flex-col justify-between">
                            {/* Top Row: Label & Value */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="outline" className={`h-5 px-1.5 border-white/10 bg-white/5 ${metrics[activeMetric].color} text-[10px] uppercase tracking-wider font-bold`}>
                                            {metrics[activeMetric].label}
                                        </Badge>
                                    </div>
                                    <div className="h-12 flex items-center overflow-hidden">
                                        <AnimatePresence mode="wait">
                                            <motion.h2
                                                key={activeMetric}
                                                initial={{ y: 20, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                exit={{ y: -20, opacity: 0 }}
                                                transition={{ duration: 0.3 }}
                                                className="text-4xl font-bold text-white tracking-tighter drop-shadow-lg"
                                            >
                                                {metrics[activeMetric].value}
                                            </motion.h2>
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Dynamic Icon Box */}
                                <motion.div
                                    animate={{
                                        borderColor: metrics[activeMetric].hexColor,
                                        boxShadow: `0 0 20px -5px ${metrics[activeMetric].hexColor}40`
                                    }}
                                    className="w-12 h-12 rounded-2xl bg-white/[0.03] border flex items-center justify-center backdrop-blur-md transition-colors duration-500"
                                >
                                    <ActiveIcon className={`h-5 w-5`} style={{ color: metrics[activeMetric].hexColor }} />
                                </motion.div>
                            </div>

                            {/* Bottom Row: System Status & Dots */}
                            <div className="flex items-end justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="relative flex h-2 w-2">
                                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75`} style={{ backgroundColor: metrics[activeMetric].hexColor }}></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: metrics[activeMetric].hexColor }}></span>
                                        </span>
                                        <motion.span
                                            key={activeMetric}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="text-xs font-medium tracking-wide uppercase"
                                            style={{ color: metrics[activeMetric].hexColor }}
                                        >
                                            {activeMetric === 0 ? t('status.operational') : activeMetric === 1 ? t('status.analytics') : t('status.secure')}
                                        </motion.span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-mono pl-4">ID: 9X-214</div>
                                </div>

                                {/* Navigation Dots */}
                                <div className="flex gap-2 p-2 rounded-full bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm">
                                    {[0, 1, 2].map((idx) => (
                                        <button
                                            key={idx}
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent card click
                                                setActiveMetric(idx);
                                            }}
                                            className={`relative w-2 h-2 rounded-full transition-all duration-300 ${activeMetric === idx ? 'w-6' : 'hover:scale-125'}`}
                                            style={{
                                                backgroundColor: activeMetric === idx ? metrics[idx].hexColor : 'rgba(255,255,255,0.2)'
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* 3. Quick Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="grid grid-cols-4 gap-4" // Use 4 cols, maybe stretch last one or center
                >
                    {quickActionsLinks.map((action, i) => (
                        <Link href={action.href} key={i} className="flex flex-col items-center gap-2 group">
                            <div className={`w-14 h-14 rounded-2xl ${action.bg} flex items-center justify-center border border-white/[0.05] group-active:scale-95 transition-transform`}>
                                <action.icon className={`h-6 w-6 ${action.color}`} />
                            </div>
                            <span className="text-xs font-medium text-gray-400 group-hover:text-white transition-colors">{action.label}</span>
                        </Link>
                    ))}
                    <Link href="/dashboard/settings" className="flex flex-col items-center gap-2 group">
                        <div className="w-14 h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center border border-white/[0.05] group-active:scale-95 transition-transform">
                            <MoreHorizontal className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-xs font-medium text-gray-400 group-hover:text-white transition-colors">{t('quickActions.more')}</span>
                    </Link>
                </motion.div>

                {/* 4. Active Numbers Ticker */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-4"
                >
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-lg font-semibold text-white">{t('vault.title')}</h3>
                        <Link href="/dashboard/vault">
                            <Button variant="link" className="text-[hsl(var(--neon-lime))] text-xs h-auto p-0 hover:no-underline">
                                {t('vault.viewAll')} <ArrowUpRight className="ml-1 h-3 w-3" />
                            </Button>
                        </Link>
                    </div>

                    {(!isMounted || isLoadingNumbers) ? (
                        <div className="flex gap-4 overflow-x-auto pb-2 snap-x hide-scrollbar">
                            {[...Array(3)].map((_, i) => (
                                <NumberCardSkeleton key={i} index={i} className="snap-center shrink-0 w-[250px] h-[140px]" />
                            ))}
                        </div>
                    ) : activeNumbers.length > 0 ? (
                        <>
                            <div
                                ref={scrollContainerRef}
                                className="flex gap-4 overflow-x-auto pb-2 snap-x hide-scrollbar"
                                onScroll={(e) => {
                                    const container = e.currentTarget;
                                    const scrollLeft = container.scrollLeft;
                                    const cardWidth = 240 + 16; // card width + gap
                                    const index = Math.round(scrollLeft / cardWidth);
                                    setActiveCardIndex(Math.min(index, activeNumbers.length - 1));
                                }}
                            >
                                {activeNumbers.slice(0, 5).map((num) => (
                                    <div key={num.id} className="snap-center shrink-0 w-[240px]">
                                        <ModernNumberCard
                                            id={num.id}
                                            number={num.number}
                                            phoneCountryCode={(num as any).phoneCountryCode}
                                            phoneNationalNumber={(num as any).phoneNationalNumber}
                                            countryCode={num.countryCode}
                                            countryName={num.countryName}
                                            countryIconUrl={num.countryIconUrl}
                                            serviceName={num.serviceName}
                                            serviceIconUrl={num.serviceIconUrl}
                                            smsCount={num.smsCount}
                                            expiresAt={num.expiresAt}
                                            status={num.status || 'active'}
                                            currencyPrices={num.currencyPrices}
                                            className="h-[120px]"
                                        />
                                    </div>
                                ))}

                                {/* "View All" Card */}
                                {activeNumbers.length > 5 && (
                                    <Link
                                        href="/dashboard/vault"
                                        className="snap-center shrink-0 w-[240px] relative group cursor-pointer"
                                    >
                                        <div className="h-full w-full rounded-2xl bg-[#12141a] border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 hover:bg-white/[0.03] transition-colors p-6">
                                            <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                                <ArrowUpRight className="w-5 h-5 text-[hsl(var(--neon-lime))]" />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-sm font-bold text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors">{t('vault.viewAllNumbers')}</p>
                                                <p className="text-xs text-gray-500 mt-1">{t('vault.moreInVault', { count: activeNumbers.length - 5 })}</p>
                                            </div>
                                        </div>
                                    </Link>
                                )}
                            </div>

                            {/* Dot Pagination Indicator - Max 3 visible dots */}
                            {activeNumbers.length > 1 && (
                                <div className="flex justify-center items-center gap-1.5 mt-3 p-2 rounded-full bg-white/[0.03] border border-white/[0.05] w-fit mx-auto">
                                    {(() => {
                                        const total = activeNumbers.length;
                                        const maxDots = 3;

                                        // Calculate which dots to show (sliding window)
                                        let start = Math.max(0, activeCardIndex - 1);
                                        let end = Math.min(total, start + maxDots);

                                        // Adjust if we're near the end
                                        if (end - start < maxDots && start > 0) {
                                            start = Math.max(0, end - maxDots);
                                        }

                                        const visibleDots = [];
                                        for (let i = start; i < end; i++) {
                                            visibleDots.push(i);
                                        }

                                        return visibleDots.map((idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    const container = scrollContainerRef.current;
                                                    if (container) {
                                                        const cardWidth = 240 + 16;
                                                        container.scrollTo({ left: idx * cardWidth, behavior: 'smooth' });
                                                    }
                                                }}
                                                className={`rounded-full transition-all duration-300 ${activeCardIndex === idx ? 'w-6 h-2 bg-[hsl(var(--neon-lime))]' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
                                            />
                                        ));
                                    })()}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="p-6 rounded-2xl bg-[#12141a] border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
                                <Phone className="h-6 w-6 text-gray-500" />
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">{t('vault.emptyTitle')}</p>
                            <Link href="/dashboard/buy">
                                <Button size="sm" className="bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)] font-semibold">
                                    {t('vault.purchaseBtn')}
                                </Button>
                            </Link>
                        </div>
                    )}
                </motion.div>

                {/* 5. Recent Activity List (Compact) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-4"
                >
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-lg font-semibold text-white">{t('activity.title')}</h3>
                        <Link href="/dashboard/history">
                            <Button variant="link" className="text-[hsl(var(--neon-lime))] text-xs h-auto p-0 hover:no-underline">
                                {t('vault.viewAll')} <ArrowUpRight className="ml-1 h-3 w-3" />
                            </Button>
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {transactions.slice(0, 3).map((tx, j) => {
                            const isCredit = ['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type)
                            return (
                                <div key={j} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCredit ? 'bg-emerald-500/10 text-emerald-500' :
                                            ['purchase', 'manual_debit'].includes(tx.type) ? 'bg-purple-500/10 text-purple-500' :
                                                'bg-indigo-500/10 text-indigo-500'
                                            }`}>
                                            {isCredit ? <ArrowUpRight className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">{tx.description}</p>
                                            <p className="text-[10px] text-gray-500 capitalize">{tx.type.replace('_', ' ')}</p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-bold font-mono ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isCredit ? '+' : ''}
                                        {/* tx.currencyPrices is the canonical pre-computed map from the backend (Zero-Math).
                                            Old transactions before the snapshot migration will show '—'. */}
                                        {tx.currencyPrices
                                            ? <PriceDisplay currencyPrices={tx.currencyPrices} />
                                            : <span className="text-muted-foreground text-xs">—</span>
                                        }
                                    </span>
                                </div>
                            )
                        })}
                        {transactions.length === 0 && (
                            <p className="text-sm text-muted-foreground px-2">{t('activity.empty')}</p>
                        )}
                    </div>
                </motion.div>
            </div >
        </div >
    )
}
