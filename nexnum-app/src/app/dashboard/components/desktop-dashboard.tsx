"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { motion, useScroll, useTransform, useSpring } from "framer-motion"
import {
    Wallet,
    Phone,
    ArrowRight,
    MessageSquare,
    TrendingUp,
    CreditCard,
    Gift,
    Sparkles,
    ChevronRight,
    Plus,
    Copy,
    Check,
    Clock,
    ShoppingCart,
    Globe,
    ShieldCheck,
    Zap
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { useAuthStore } from "@/stores/authStore"
import { formatPrice } from "@/lib/utils"
import { toast } from "sonner"
import { DashboardBackground } from "./dashboard-background"
import { PhoneMockup } from "./phone-mockup"
import { NotificationsBtn } from "./shared"
import { DashboardNumberCard } from "./DashboardNumberCard"

// Animation Variants
const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
}

const stagger = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

// Premium "Tech" Logical Separator
const TechSeparator = () => (
    <div className="relative w-full py-4 flex items-center justify-center overflow-hidden">
        {/* Central Line */}
        <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />

        {/* Logical Ruler Markings (CSS Pattern) */}
        <div
            className="absolute inset-x-0 h-2 opacity-20"
            style={{
                backgroundImage: 'linear-gradient(90deg, white 1px, transparent 1px)',
                backgroundSize: '20px 100%',
                maskImage: 'linear-gradient(to right, transparent, black 40%, black 60%, transparent)'
            }}
        />

        {/* Central "Energy" Node */}
        <div className="relative z-10 w-2 h-2 rounded-full bg-[hsl(var(--neon-lime))] shadow-[0_0_10px_hsl(var(--neon-lime))]">
            <div className="absolute inset-0 animate-ping rounded-full bg-[hsl(var(--neon-lime))] opacity-50" />
        </div>
    </div>
)

export function DesktopDashboard() {
    const { user } = useAuthStore()
    const { userProfile, activeNumbers, transactions } = useGlobalStore()
    const containerRef = useRef<HTMLDivElement>(null)

    // Parallax & Scroll
    const { scrollY } = useScroll()
    const yHero = useTransform(scrollY, [0, 500], [0, 50])

    // Greeting
    const hour = new Date().getHours()
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

    // Stats Logic
    const totalSpent = transactions.filter(t => t.type === "purchase").reduce((sum, t) => sum + Math.abs(t.amount), 0)
    const totalDeposit = transactions.filter(t => t.type === "topup").reduce((sum, t) => sum + t.amount, 0)

    const stats = [
        { label: "Total Balance", value: formatPrice(userProfile?.balance || 0), icon: Wallet, color: "text-[hsl(var(--neon-lime))]", bg: "bg-[hsl(var(--neon-lime)/0.1)]", border: "border-[hsl(var(--neon-lime)/0.2)]" },
        { label: "Active Numbers", value: activeNumbers.length, icon: Phone, color: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/20" },
        { label: "Total Spent", value: formatPrice(totalSpent), icon: ShoppingCart, color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
        { label: "Total Deposited", value: formatPrice(totalDeposit), icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
    ]

    return (
        <div ref={containerRef} className="min-h-screen relative bg-[#0a0a0c] overflow-hidden selection:bg-[hsl(var(--neon-lime)/0.3)]">
            <DashboardBackground />

            {/* Content Wrapper */}
            <div className="relative z-10 px-8 py-10 max-w-[1600px] mx-auto space-y-12">

                {/* 1. Hero Section (Parallax Split) */}
                <div className="grid grid-cols-12 gap-12 min-h-[500px] items-center">
                    {/* Left: Content (40%) */}
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={stagger}
                        className="col-span-12 lg:col-span-5 space-y-8"
                        style={{ y: yHero }}
                    >
                        <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08]">
                            <span className="w-2 h-2 rounded-full bg-[hsl(var(--neon-lime))] animate-pulse" />
                            <span className="text-xs font-medium text-gray-300">System Operational</span>
                        </motion.div>

                        <motion.h1 variants={fadeIn} className="text-5xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1]">
                            {greeting}, <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(var(--neon-lime))] to-emerald-500">
                                {user?.name?.split(' ')[0] || "Trader"}
                            </span>
                        </motion.h1>

                        <motion.p variants={fadeIn} className="text-lg text-gray-400 max-w-md leading-relaxed">
                            Your secure gateway to global communication. Manage valid numbers, track usage, and scale your operations instantly.
                        </motion.p>

                        <motion.div variants={fadeIn} className="flex items-center gap-4">
                            <Link href="/dashboard/buy">
                                <Button className="h-14 px-8 rounded-2xl bg-[hsl(var(--neon-lime))] text-black text-lg font-bold hover:bg-[hsl(72,100%,55%)] hover:scale-105 transition-all shadow-[0_0_20px_rgba(204,255,0,0.3)]">
                                    <Plus className="mr-2 h-5 w-5" />
                                    New Number
                                </Button>
                            </Link>
                            <Link href="/dashboard/wallet">
                                <Button variant="outline" className="h-14 px-8 rounded-2xl border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08] text-lg font-medium">
                                    Top Up Wallet
                                </Button>
                            </Link>
                        </motion.div>
                    </motion.div>

                    {/* Right: 3D Isometric View (60%) */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="col-span-12 lg:col-span-7 relative h-[600px] hidden lg:block perspective-1000"
                    >
                        {/* 3D Composition */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            {/* Central Phone (Hero) */}
                            <div className="relative z-20">
                                <PhoneMockup />
                            </div>

                            {/* Floating "Islands" / Glass Panels */}
                            <motion.div
                                animate={{ y: [-10, 10, -10] }}
                                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute top-20 right-20 z-10 p-6 rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 w-64 shadow-2xl"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-2 rounded-xl bg-purple-500/20"><Globe className="h-5 w-5 text-purple-400" /></div>
                                    <Badge variant="outline" className="border-purple-500/30 text-purple-400">Global</Badge>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-sm text-gray-400">Total Coverage</div>
                                    <div className="text-2xl font-bold">180+ Countries</div>
                                </div>
                            </motion.div>

                            <motion.div
                                animate={{ y: [15, -15, 15] }}
                                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                                className="absolute bottom-40 left-10 z-30 p-6 rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 w-56 shadow-2xl"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-2 rounded-xl bg-[hsl(var(--neon-lime)/0.2)]"><ShieldCheck className="h-5 w-5 text-[hsl(var(--neon-lime))]" /></div>
                                    <Badge variant="outline" className="border-[hsl(var(--neon-lime)/0.3)] text-[hsl(var(--neon-lime))]">Secure</Badge>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-sm text-gray-400">Verification</div>
                                    <div className="text-2xl font-bold">Instant</div>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>

                {/* 2. Stats Grid (Glassmorphism) */}
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
                            {/* Gradient Border Wrapper */}
                            <div className={`absolute -inset-[1px] rounded-[24px] bg-gradient-to-br from-white/20 via-white/5 to-transparent opacity-50 group-hover:opacity-100 group-hover:via-[hsl(var(--neon-lime)/0.3)] transition-all duration-500`} />

                            {/* Inner Card */}
                            <div className="relative h-full rounded-[24px] bg-[#0d0d10]/50 backdrop-blur-xl p-6 flex flex-col justify-between overflow-hidden">
                                {/* Ambient Glow */}
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

                {/* 3. Main Content: Active Numbers & History */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Active Numbers Card - Premium Glass */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="lg:col-span-2 relative group"
                    >
                        {/* Gradient Border for Large Card */}
                        <div className="absolute -inset-[1px] rounded-[32px] bg-gradient-to-b from-white/10 to-transparent opacity-60" />

                        <div className="relative h-full rounded-[31px] bg-[#0c0e12]/80 backdrop-blur-3xl overflow-hidden flex flex-col">
                            {/* Inner content */}
                            <div className="p-8 border-b border-white/[0.03] flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-xl font-bold text-white">Active Numbers</h3>
                                        <Badge variant="outline" className="border-[hsl(var(--neon-lime)/0.3)] text-[hsl(var(--neon-lime))] text-[10px] uppercase">
                                            Vault
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-gray-400">Manage and monitor your active virtual lines.</p>
                                </div>
                                <Link href="/dashboard/vault">
                                    <Button variant="ghost" className="text-[hsl(var(--neon-lime))] hover:text-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime)/0.1)] gap-2 group/btn">
                                        View Vault
                                        <div className="bg-[hsl(var(--neon-lime)/0.2)] p-1 rounded-full group-hover/btn:bg-[hsl(var(--neon-lime))] group-hover/btn:text-black transition-colors">
                                            <ArrowRight className="h-3 w-3" />
                                        </div>
                                    </Button>
                                </Link>
                            </div>

                            <div className="p-8 bg-gradient-to-b from-transparent to-black/20 flex-1">
                                {activeNumbers.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {activeNumbers.slice(0, 4).map(num => (
                                            <DashboardNumberCard
                                                key={num.id}
                                                id={num.id}
                                                number={num.phoneNumber}
                                                countryCode={num.countryCode}
                                                countryName={num.countryName}
                                                serviceName={num.serviceName}
                                                smsCount={num.smsCount}
                                                expiresAt={num.expiresAt}
                                                status={num.status}
                                                latestSms={num.latestSms}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                                        <div className="w-20 h-20 rounded-full bg-[hsl(var(--neon-lime)/0.05)] flex items-center justify-center mb-6 border border-[hsl(var(--neon-lime)/0.1)] shadow-[0_0_30px_-10px_hsl(var(--neon-lime)/0.2)]">
                                            <Phone className="h-8 w-8 text-[hsl(var(--neon-lime))]" />
                                        </div>
                                        <h4 className="text-xl font-bold text-white mb-2">No active numbers</h4>
                                        <p className="text-gray-400 max-w-[250px] mb-8 leading-relaxed">Your vault is empty. Purchase a number to start receiving SMS instantly.</p>
                                        <Link href="/dashboard/buy">
                                            <Button className="h-12 px-8 rounded-xl bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(72,100%,60%)] shadow-lg shadow-[hsl(var(--neon-lime)/0.2)]">
                                                Purchase Number
                                            </Button>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Column: Quick Actions & Activity */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="lg:col-span-1 space-y-6"
                    >
                        {/* Quick Topup - Gradient Card */}
                        <div className="relative group p-[1px] rounded-[32px] bg-gradient-to-br from-indigo-500/30 via-purple-500/10 to-transparent">
                            <div className="relative rounded-[31px] bg-[#1e1b2e]/60 backdrop-blur-xl p-6 overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-[80px]" />

                                <h3 className="relative z-10 text-lg font-bold text-white mb-5 flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-indigo-400" />
                                    Quick Top-up
                                </h3>

                                <div className="relative z-10 grid grid-cols-3 gap-3 mb-5">
                                    {[10, 25, 50].map(amt => (
                                        <Button key={amt} variant="outline" className="h-12 border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/20 text-indigo-300 hover:text-white hover:border-indigo-500/40 font-mono font-medium rounded-xl transition-all">
                                            ${amt}
                                        </Button>
                                    ))}
                                </div>
                                <Link href="/dashboard/wallet" className="relative z-10 block">
                                    <Button className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 rounded-xl font-semibold tracking-wide">
                                        Add Funds
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        {/* Recent Transactions - Clean List */}
                        <div className="relative rounded-[32px] bg-[#0d0d10] border border-white/[0.06] p-6 overflow-hidden">
                            <h3 className="text-lg font-bold text-white mb-5 px-1">Recent Activity</h3>
                            <div className="space-y-1">
                                {transactions.slice(0, 4).map((tx, i) => (
                                    <div key={i} className="group flex items-center justify-between p-3 rounded-2xl hover:bg-white/[0.03] transition-colors cursor-default">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border border-white/[0.05] ${tx.type === 'topup' ? 'bg-emerald-500/5 text-emerald-500' : 'bg-red-500/5 text-red-500'}`}>
                                                {tx.type === 'topup' ? <TrendingUp className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white group-hover:text-white/90">{tx.description}</p>
                                                <p className="text-xs text-gray-500 font-mono mt-0.5">{new Date(tx.date).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`block text-sm font-mono font-bold ${tx.type === 'topup' ? 'text-emerald-400' : 'text-white'}`}>
                                                {tx.type === 'topup' ? '+' : ''}{formatPrice(tx.amount)}
                                            </span>
                                            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">{tx.status || 'Done'}</span>
                                        </div>
                                    </div>
                                ))}
                                {transactions.length === 0 && (
                                    <p className="text-sm text-gray-500 text-center py-4">No recent activity.</p>
                                )}
                            </div>
                        </div>

                    </motion.div>
                </div>
            </div>
        </div>
    )
}
