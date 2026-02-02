"use client"

import { useRef } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { motion, useScroll, useTransform } from "framer-motion"
import {
    Wallet,
    Phone,
    ArrowRight,
    TrendingUp,
    ShoppingCart,
    Plus,
    Zap,
    Globe,
    ShieldCheck
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/stores/appStore"
import { useAuthStore } from "@/stores/authStore"
import { formatPrice } from "@/lib/utils/utils"
import { DashboardBackground } from "./dashboard-background"
import { ModernNumberCard } from "./ModernNumberCard"
import { BalanceDisplay, PriceDisplay } from "@/components/common/PriceDisplay"
import { useCurrency } from "@/providers/CurrencyProvider"


// Animation Variants
const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
}

const stagger = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const MiniBarChart = ({ color, data = [30, 15, 15, 30, 20, 15, 30] }: { color: string, data?: number[] }) => {
    // Normalize data for chart height (max 24px)
    const maxVal = Math.max(...data, 1)
    const normalizedData = data.map(v => Math.max((v / maxVal) * 24, 2)) // Min 2px height for visibility

    return (
        <svg width="60" height="24" viewBox="0 0 60 24" className="opacity-40 group-hover:opacity-100 transition-opacity duration-500">
            {normalizedData.map((h, i) => (
                <rect
                    key={i}
                    x={i * 8}
                    y={24 - h}
                    width="4"
                    height={h}
                    rx="2"
                    fill={color}
                    className="transition-all duration-500"
                />
            ))}
        </svg>
    )
}

export function DesktopDashboard() {
    const { user } = useAuthStore()
    const { userProfile, activeNumbers, transactions, usageSummary, totalSpent, totalDeposited } = useGlobalStore()
    const containerRef = useRef<HTMLDivElement>(null)
    const { settings } = useCurrency()
    const pointsRate = Number(settings?.pointsRate) || 100

    const t = useTranslations('dashboard')

    // Parallax & Scroll
    const { scrollY } = useScroll()
    const yHero = useTransform(scrollY, [0, 500], [0, 50])

    const hour = new Date().getHours()
    const greeting = hour < 12 ? t('greeting.morning') : hour < 18 ? t('greeting.afternoon') : t('greeting.evening')

    const stats = [
        { label: t('stats.balance'), value: <BalanceDisplay balanceInPoints={userProfile?.balance || 0} />, icon: Wallet, color: "text-[hsl(var(--neon-lime))]", fill: "hsl(var(--neon-lime))", bg: "bg-[hsl(var(--neon-lime)/0.1)]", border: "border-[hsl(var(--neon-lime)/0.2)]", data: [0, 0, 0, 0, 0, 0, (userProfile?.balance || 0) / 100] },
        { label: t('stats.myNumbers'), value: activeNumbers.length, icon: Phone, color: "text-cyan-400", fill: "#22d3ee", bg: "bg-cyan-400/10", border: "border-cyan-400/20", data: [0, 0, 0, 0, 0, 0, activeNumbers.length] },
        { label: t('stats.spent'), value: <PriceDisplay amountInPoints={totalSpent || 0} />, icon: ShoppingCart, color: "text-purple-400", fill: "#c084fc", bg: "bg-purple-400/10", border: "border-purple-400/20", data: usageSummary },
        { label: t('stats.deposited'), value: <PriceDisplay amountInPoints={totalDeposited || 0} />, icon: TrendingUp, color: "text-emerald-400", fill: "#34d399", bg: "bg-emerald-400/10", border: "border-emerald-400/20", data: [0, 0, 0, 0, 0, 0, (totalDeposited || 0) / 1000] },
    ]

    return (
        <div ref={containerRef} className="min-h-screen relative bg-[#0a0a0c] overflow-hidden selection:bg-[hsl(var(--neon-lime)/0.3)]">
            <DashboardBackground />

            <div className="relative z-10 px-6 py-6 max-w-[1800px] mx-auto space-y-6">

                {/* 1. Header Section (Refined Content) */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-2">
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={stagger}
                        className="space-y-1"
                        style={{ y: yHero }}
                    >
                        <motion.h1 variants={fadeIn} className="text-xl lg:text-3xl font-bold tracking-tight text-white leading-tight">
                            {greeting}, <span className="text-[hsl(var(--neon-lime))]">{user?.name?.split(' ')[0] || "Trader"}</span>
                        </motion.h1>
                        <motion.p variants={fadeIn} className="text-sm text-gray-500 max-w-xl font-medium">
                            {t('hero.subtitle')}
                        </motion.p>
                    </motion.div>

                    <motion.div variants={fadeIn} className="flex items-center gap-3">
                        <Link href="/dashboard/buy">
                            <Button size="sm" className="h-9 px-4 rounded-lg bg-[hsl(var(--neon-lime))] text-black text-sm font-bold hover:bg-[hsl(72,100%,60%)] active:scale-95 transition-all shadow-lg shadow-[hsl(var(--neon-lime)/0.2)]">
                                <Plus className="mr-1.5 h-4 w-4" />
                                {t('hero.newNumber')}
                            </Button>
                        </Link>
                        <Link href="/dashboard/wallet">
                            <Button size="sm" variant="outline" className="h-9 px-4 rounded-lg border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08] hover:border-white/20 text-xs font-bold backdrop-blur-sm transition-all">
                                {t('hero.topUp')}
                            </Button>
                        </Link>
                    </motion.div>
                </div>

                {/* 2. Stats Grid (High Density) */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                >
                    {stats.map((stat, i) => (
                        <motion.div
                            key={i}
                            variants={fadeIn}
                            className="relative group"
                        >
                            <div className="absolute -inset-[1px] rounded-[18px] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-40 group-hover:opacity-100 group-hover:via-[hsl(var(--neon-lime)/0.2)] transition-all duration-500" />
                            <div className="relative rounded-[17px] bg-[#0d0d10]/60 backdrop-blur-xl p-3.5 flex items-center gap-3 overflow-hidden border border-white/5 h-[80px]">
                                <div className={`p-2 rounded-lg ${stat.bg} ${stat.color} ring-1 ring-white/5 transition-transform duration-300 group-hover:scale-105 shadow-lg flex-shrink-0`}>
                                    <stat.icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0 z-10">
                                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">{stat.label}</p>
                                    <h3 className="text-2xl font-bold text-white tracking-tight leading-none truncate whitespace-nowrap">{stat.value}</h3>
                                </div>
                                <div className="hidden xl:block absolute right-2 bottom-2">
                                    <MiniBarChart color={stat.fill} data={stat.data} />
                                </div>
                                {/* Progress background */}
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.03] overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        whileInView={{ width: "65%" }}
                                        transition={{ duration: 1.2, delay: 0.1 + (i * 0.1) }}
                                        className={`h-full ${stat.bg.replace('/0.1', '')} opacity-60`}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* 3. Main Content: Active Numbers & History (Ultra-Wide Support) */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Active Numbers Card (Taking 3/4) */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="lg:col-span-3 relative group"
                    >
                        <div className="absolute -inset-[1px] rounded-[24px] bg-gradient-to-b from-white/10 to-transparent opacity-40" />
                        <div className="relative h-full rounded-[23px] bg-[#0c0e12]/80 backdrop-blur-3xl overflow-hidden flex flex-col border border-white/[0.02]">
                            <div className="px-5 py-3 border-b border-white/[0.03] flex items-center justify-between bg-[#0f1115]/50">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-base font-bold text-white tracking-tight">{t('vault.title')}</h3>
                                    <span className="px-2 py-0.5 rounded-md bg-[hsl(var(--neon-lime)/0.1)] text-[hsl(var(--neon-lime))] text-[9px] font-bold uppercase tracking-wider border border-[hsl(var(--neon-lime)/0.2)] shadow-[0_0_10px_hsla(var(--neon-lime),0.1)]">{t('vault.badge')}</span>
                                </div>
                                <Link href="/dashboard/vault">
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] gap-1.5 group/btn rounded-full px-3">
                                        {t('vault.viewVault')} <ArrowRight className="h-3 w-3 transition-transform group-hover/btn:translate-x-0.5" />
                                    </Button>
                                </Link>
                            </div>
                            <div className="p-5 flex-1 bg-[url('/assets/grid.svg')] bg-opacity-5">
                                {activeNumbers.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                        {activeNumbers.slice(0, 8).map(num => (
                                            <ModernNumberCard
                                                key={num.id}
                                                id={num.id}
                                                number={(num as any).phoneNumber || (num as any).number}
                                                countryCode={num.countryCode}
                                                countryName={num.countryName}
                                                countryIconUrl={num.countryIconUrl}
                                                serviceName={num.serviceName}
                                                serviceIconUrl={num.serviceIconUrl}
                                                smsCount={num.smsCount}
                                                expiresAt={num.expiresAt}
                                                status={num.status || 'active'}
                                                className="h-[136px]"
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] flex items-center justify-center mb-4 border border-white/10 shadow-xl">
                                            <Phone className="h-5 w-5 text-gray-400" />
                                        </div>
                                        <h4 className="text-base font-bold text-white mb-1.5">{t('vault.emptyTitle')}</h4>
                                        <p className="text-xs text-gray-500 max-w-[240px] mb-6 leading-relaxed">{t('vault.emptyDescription')}</p>
                                        <Link href="/dashboard/buy">
                                            <Button size="sm" className="h-9 px-6 rounded-lg bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(72,100%,60%)] shadow-[0_0_20px_hsla(var(--neon-lime),0.3)] transition-all hover:scale-105 active:scale-95">
                                                {t('vault.purchaseBtn')}
                                            </Button>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* Side Column (Quick Actions & Activity) */}
                    <div className="lg:col-span-1 space-y-4">
                        {/* Quick Topup (Compact) */}
                        <div className="relative group">
                            <div className="relative rounded-[20px] bg-[#0c0e12]/90 backdrop-blur-3xl p-4 overflow-hidden border border-white/[0.05]">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(var(--neon-lime)/0.1)] rounded-full blur-[50px] opacity-20 group-hover:opacity-40 transition-all duration-500" />
                                <div className="relative z-10 flex flex-col h-[180px]">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-1.5 opacity-80">
                                            <Zap className="h-3.5 w-3.5 text-[hsl(var(--neon-lime))]" />
                                            {t('quickTopUp.title')}
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 mb-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                        {[10, 25, 50, 100].map(amt => (
                                            <button key={amt} className="group/btn relative h-8 rounded-lg bg-white/[0.03] hover:bg-[hsl(var(--neon-lime)/0.1)] border border-white/[0.06] hover:border-[hsl(var(--neon-lime)/0.3)] transition-all duration-200 flex items-center justify-between px-3">
                                                <span className="text-[11px] text-gray-400 font-medium">Top Up</span>
                                                <span className="text-sm font-mono font-bold text-white group-hover:text-[hsl(var(--neon-lime))]"><PriceDisplay amountInPoints={amt * pointsRate} precision={0} showCode={false} /></span>
                                            </button>
                                        ))}
                                    </div>
                                    <Link href="/dashboard/wallet">
                                        <Button className="w-full h-8 bg-[hsl(var(--neon-lime))] text-black text-xs font-bold rounded-lg hover:bg-[hsl(72,100%,60%)] transition-all shadow-lg shadow-[hsl(var(--neon-lime)/0.1)] uppercase tracking-wide">
                                            {t('quickTopUp.action')}
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity (High Density) */}
                        <div className="relative rounded-[20px] bg-[#0d0d10] border border-white/[0.06] p-4 overflow-hidden flex-1 min-h-[220px]">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">{t('activity.title')}</h3>
                            </div>
                            <div className="space-y-0.5">
                                {transactions.slice(0, 5).map((tx, i) => (
                                    <div key={i} className="group flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] transition-colors cursor-default border border-transparent hover:border-white/[0.02]">
                                        <div className="flex items-center gap-2.5">
                                            <div className={`w-6 h-6 rounded-md flex items-center justify-center border border-white/[0.05] ${['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type) ? 'bg-emerald-500/5 text-emerald-400' : 'bg-red-500/5 text-red-500'}`}>
                                                {['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type) ? <TrendingUp className="h-3 w-3" /> : <ShoppingCart className="h-3 w-3" />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-bold text-gray-200 truncate max-w-[120px] leading-tight">{tx.description}</p>
                                                <p className="text-[10px] text-gray-600 font-mono">{new Date(tx.date).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className={`block text-xs font-mono font-bold ${['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type) ? 'text-emerald-400' : 'text-gray-400'}`}>
                                                {['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type) ? '+' : ''}
                                                <PriceDisplay amountInPoints={tx.amount} />
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {transactions.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-8 text-gray-700">
                                        <ShieldCheck className="h-6 w-6 mb-2 opacity-20" />
                                        <p className="text-[10px] font-medium">{t('activity.empty')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
