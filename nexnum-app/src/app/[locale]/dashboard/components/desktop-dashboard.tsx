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


// Animation Variants
const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
}

const stagger = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

export function DesktopDashboard() {
    const { user } = useAuthStore()
    const { userProfile, activeNumbers, transactions } = useGlobalStore()
    const containerRef = useRef<HTMLDivElement>(null)

    const t = useTranslations('dashboard')

    // Parallax & Scroll
    const { scrollY } = useScroll()
    const yHero = useTransform(scrollY, [0, 500], [0, 50])

    const hour = new Date().getHours()
    const greeting = hour < 12 ? t('greeting.morning') : hour < 18 ? t('greeting.afternoon') : t('greeting.evening')

    const totalSpent = transactions
        .filter(t => ['purchase', 'manual_debit'].includes(t.type))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    const totalDeposit = transactions
        .filter(t => ['topup', 'manual_credit', 'referral_bonus'].includes(t.type))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    const stats = [
        { label: t('stats.balance'), value: formatPrice(userProfile?.balance || 0), icon: Wallet, color: "text-[hsl(var(--neon-lime))]", bg: "bg-[hsl(var(--neon-lime)/0.1)]", border: "border-[hsl(var(--neon-lime)/0.2)]" },
        { label: t('stats.myNumbers'), value: activeNumbers.length, icon: Phone, color: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/20" },
        { label: t('stats.spent'), value: formatPrice(totalSpent), icon: ShoppingCart, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
        { label: t('stats.deposited'), value: formatPrice(totalDeposit), icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
    ]

    return (
        <div ref={containerRef} className="min-h-screen relative bg-[#0a0a0c] overflow-hidden selection:bg-[hsl(var(--neon-lime)/0.3)]">
            <DashboardBackground />

            <div className="relative z-10 px-8 py-10 max-w-[1600px] mx-auto space-y-12">

                {/* 1. Hero Section (Restored) */}
                <div className="flex flex-col items-center justify-center min-h-[300px] mb-8">
                    {/* Left: Content (40%) */}
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={stagger}
                        className="w-full max-w-4xl space-y-4 flex flex-col items-center text-center"
                        style={{ y: yHero }}
                    >
                        <motion.div variants={fadeIn} className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-md">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-semibold text-emerald-100 tracking-wide uppercase">{t('status.operational')}</span>
                        </motion.div>

                        <motion.h1 variants={fadeIn} className="text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.1] drop-shadow-2xl mt-2">
                            {greeting},{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(var(--neon-lime))] via-emerald-400 to-emerald-500 filter drop-shadow-[0_0_20px_rgba(204,255,0,0.3)]">
                                {user?.name?.split(' ')[0] || "Trader"}
                            </span>
                        </motion.h1>

                        <motion.p variants={fadeIn} className="text-lg text-gray-400 max-w-lg leading-relaxed font-light">
                            {t('hero.subtitle')}
                        </motion.p>

                        <motion.div variants={fadeIn} className="flex items-center justify-center gap-5">
                            <Link href="/dashboard/buy">
                                <Button className="h-11 px-6 rounded-xl bg-[hsl(var(--neon-lime))] text-black text-base font-bold hover:bg-[hsl(72,100%,60%)] active:scale-95 transition-all shadow-[0_0_20px_-5px_hsl(var(--neon-lime)/0.4)] hover:shadow-[0_0_30px_-5px_hsl(var(--neon-lime)/0.6)]">
                                    <Plus className="mr-2 h-5 w-5" />
                                    {t('hero.newNumber')}
                                </Button>
                            </Link>
                            <Link href="/dashboard/wallet">
                                <Button variant="outline" className="h-11 px-6 rounded-xl border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08] hover:border-white/20 text-base font-medium backdrop-blur-sm transition-all">
                                    {t('hero.topUp')}
                                </Button>
                            </Link>
                        </motion.div>
                    </motion.div>


                </div>

                {/* 2. Stats Grid (Restored) */}
                <motion.div
                    variants={stagger}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                >
                    {stats.map((stat, i) => (
                        <motion.div
                            key={i}
                            variants={fadeIn}
                            className="relative group h-full"
                        >
                            <div className={`absolute -inset-[1px] rounded-[24px] bg-gradient-to-br from-white/20 via-white/5 to-transparent opacity-50 group-hover:opacity-100 group-hover:via-[hsl(var(--neon-lime)/0.3)] transition-all duration-500`} />
                            <div className="relative h-full rounded-[24px] bg-[#0d0d10]/50 backdrop-blur-xl p-6 flex flex-col justify-between overflow-hidden">
                                <div className={`absolute top-0 right-0 w-32 h-32 ${stat.bg.replace("bg-", "bg-").replace("/0.1", "/0.05")} rounded-full blur-[60px] group-hover:opacity-100 transition-opacity opacity-50`} />
                                <div className="relative z-10 flex justify-between items-start mb-4">
                                    <div>
                                        <p className="text-sm font-medium text-gray-400 group-hover:text-gray-300 transition-colors">{stat.label}</p>
                                        <h3 className="text-3xl font-bold mt-2 tracking-tight text-white drop-shadow-sm">{stat.value}</h3>
                                    </div>
                                    <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color} ring-1 ring-white/5 group-hover:scale-110 transition-transform duration-500 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)]`}>
                                        <stat.icon className="h-6 w-6" />
                                    </div>
                                </div>
                                <div className="relative z-10 w-full h-1 bg-white/5 rounded-full overflow-hidden mt-4">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        whileInView={{ width: "60%" }}
                                        transition={{ duration: 1.5, delay: 0.2 + (i * 0.1), ease: "easeOut" }}
                                        className={`h-full ${stat.bg.replace('/0.1', '')} shadow-[0_0_10px_rgba(255,255,255,0.3)]`}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* 3. Main Content: Active Numbers & History (Restored) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Active Numbers Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="lg:col-span-2 relative group"
                    >
                        <div className="absolute -inset-[1px] rounded-[32px] bg-gradient-to-b from-white/10 to-transparent opacity-60" />
                        <div className="relative h-full rounded-[31px] bg-[#0c0e12]/80 backdrop-blur-3xl overflow-hidden flex flex-col">
                            <div className="p-8 border-b border-white/[0.03] flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-xl font-bold text-white">{t('vault.title')}</h3>
                                        <div className="px-2 py-0.5 rounded-full border border-[hsl(var(--neon-lime)/0.3)] text-[hsl(var(--neon-lime))] text-[10px] uppercase">{t('vault.badge')}</div>
                                    </div>
                                    <p className="text-sm text-gray-400">{t('vault.description')}</p>
                                </div>
                                <Link href="/dashboard/vault">
                                    <Button variant="ghost" className="text-[hsl(var(--neon-lime))] hover:text-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime)/0.1)] gap-2 group/btn">
                                        {t('vault.viewVault')} <ArrowRight className="h-3 w-3" />
                                    </Button>
                                </Link>
                            </div>
                            <div className="p-8 bg-gradient-to-b from-transparent to-black/20 flex-1">
                                {activeNumbers.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                        {activeNumbers.slice(0, 6).map(num => (
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
                                                status={num.status}
                                                className="h-[140px]"
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                                        <div className="w-20 h-20 rounded-full bg-[hsl(var(--neon-lime)/0.05)] flex items-center justify-center mb-6 border border-[hsl(var(--neon-lime)/0.1)] shadow-[0_0_30px_-10px_hsl(var(--neon-lime)/0.2)]">
                                            <Phone className="h-8 w-8 text-[hsl(var(--neon-lime))]" />
                                        </div>
                                        <h4 className="text-xl font-bold text-white mb-2">{t('vault.emptyTitle')}</h4>
                                        <p className="text-gray-400 max-w-[250px] mb-8 leading-relaxed">{t('vault.emptyDescription')}</p>
                                        <Link href="/dashboard/buy">
                                            <Button className="h-12 px-8 rounded-xl bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(72,100%,60%)] shadow-lg shadow-[hsl(var(--neon-lime)/0.2)]">
                                                {t('vault.purchaseBtn')}
                                            </Button>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* Quick Actions & Activity */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="lg:col-span-1 space-y-6"
                    >
                        {/* Quick Topup */}
                        <div className="relative group">
                            <div className="relative rounded-[31px] bg-[#0c0e12]/90 backdrop-blur-3xl p-6 overflow-hidden border border-white/[0.05]">
                                <div className="absolute top-0 right-0 w-40 h-40 bg-[hsl(var(--neon-lime)/0.1)] rounded-full blur-[60px] opacity-60 group-hover:opacity-100 transition-all duration-500" />
                                <div className="relative z-10">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                            <div className="p-2 rounded-xl bg-[hsl(var(--neon-lime)/0.1)] ring-1 ring-[hsl(var(--neon-lime)/0.2)]"><Zap className="h-4 w-4 text-[hsl(var(--neon-lime))]" /></div>
                                            {t('quickTopUp.title')}
                                        </h3>
                                        <Badge variant="outline" className="border-[hsl(var(--neon-lime)/0.3)] text-[hsl(var(--neon-lime))] text-[10px] uppercase font-bold tracking-wider">{t('quickTopUp.badge')}</Badge>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 mb-6">
                                        {[10, 25, 50].map(amt => (
                                            <button key={amt} className="group/btn relative h-14 rounded-2xl bg-white/[0.03] hover:bg-[hsl(var(--neon-lime)/0.1)] border border-white/[0.08] hover:border-[hsl(var(--neon-lime)/0.3)] transition-all duration-300 overflow-hidden">
                                                <span className="relative z-10 text-lg font-mono font-bold text-gray-300 group-hover/btn:text-white transition-colors">${amt}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <Link href="/dashboard/wallet">
                                        <Button className="w-full h-14 bg-[hsl(var(--neon-lime))] text-black text-base font-bold rounded-2xl hover:bg-[hsl(72,100%,60%)] transition-all">
                                            <Wallet className="mr-2 h-5 w-5" /> {t('quickTopUp.action')}
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Activity */}
                        <div className="relative rounded-[32px] bg-[#0d0d10] border border-white/[0.06] p-6 overflow-hidden">
                            <h3 className="text-lg font-bold text-white mb-5 px-1">{t('activity.title')}</h3>
                            <div className="space-y-1">
                                {transactions.slice(0, 4).map((tx, i) => (
                                    <div key={i} className="group flex items-center justify-between p-3 rounded-2xl hover:bg-white/[0.03] transition-colors cursor-default">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border border-white/[0.05] ${['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type) ? 'bg-emerald-500/5 text-emerald-500' : 'bg-red-500/5 text-red-500'}`}>
                                                {['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type) ? <TrendingUp className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white group-hover:text-white/90">{tx.description}</p>
                                                <p className="text-xs text-gray-500 font-mono mt-0.5">{new Date(tx.date).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`block text-sm font-mono font-bold ${['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type) ? 'text-emerald-400' : 'text-white'}`}>
                                                {['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(tx.type) ? '+' : ''}{formatPrice(tx.amount)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {transactions.length === 0 && <p className="text-sm text-gray-500 text-center py-4">{t('activity.empty')}</p>}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}
