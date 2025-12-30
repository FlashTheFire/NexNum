"use client"

import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useGlobalStore } from "@/store"
import { useAuthStore } from "@/stores/authStore"
import { formatPrice } from "@/lib/utils"
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

// Quick Actions Configuration
const quickActions = [
    { label: "New Number", icon: ShoppingCart, href: "/dashboard/buy", color: "text-[hsl(var(--neon-lime))]", bg: "bg-[hsl(var(--neon-lime)/0.1)]" },
    { label: "Top Up", icon: Wallet, href: "/dashboard/wallet", color: "text-cyan-400", bg: "bg-cyan-400/10" },
    { label: "History", icon: Clock, href: "/dashboard/history", color: "text-purple-400", bg: "bg-purple-400/10" },
]

export function MobileDashboard() {
    const { user } = useAuthStore()
    const { userProfile, activeNumbers, transactions } = useGlobalStore()
    const [scrolled, setScrolled] = useState(false)

    // Greeting
    const hour = new Date().getHours()
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

    // Carousel Logic
    const [activeMetric, setActiveMetric] = useState(0)

    const totalSpent = transactions.filter(t => t.type === "purchase").reduce((sum, t) => sum + Math.abs(t.amount), 0)
    const totalDeposit = transactions.filter(t => t.type === "topup").reduce((sum, t) => sum + t.amount, 0)

    const metrics = [
        {
            label: "Main Balance",
            value: formatPrice(userProfile?.balance || 0),
            icon: Wallet,
            color: "text-[hsl(var(--neon-lime))]",
            hexColor: "hsl(var(--neon-lime))",
            glowColor: "hsl(var(--neon-lime))"
        },
        {
            label: "Total Spent",
            value: formatPrice(totalSpent),
            icon: ShoppingCart,
            color: "text-purple-400",
            hexColor: "#a78bfa", // purple-400
            glowColor: "#c084fc"
        },
        {
            label: "Total Deposit",
            value: formatPrice(totalDeposit),
            icon: ArrowUpRight,
            color: "text-emerald-400",
            hexColor: "#34d399", // emerald-400
            glowColor: "#34d399"
        }
    ]

    const ActiveIcon = metrics[activeMetric].icon

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
                                                className="text-4xl font-mono font-bold text-white tracking-tighter drop-shadow-lg"
                                            >
                                                {metrics[activeMetric].value.split('.')[0]}
                                                <span className="text-xl text-gray-500 font-medium">.{metrics[activeMetric].value.split('.')[1]}</span>
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
                                            {activeMetric === 0 ? "System Operational" : activeMetric === 1 ? "Analytics Active" : "Funds Secure"}
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
                    {quickActions.map((action, i) => (
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
                        <span className="text-xs font-medium text-gray-400 group-hover:text-white transition-colors">More</span>
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
                        <h3 className="text-lg font-semibold text-white">Active Numbers</h3>
                        <Link href="/dashboard/vault">
                            <Button variant="link" className="text-[hsl(var(--neon-lime))] text-xs h-auto p-0 hover:no-underline">
                                View All <ArrowUpRight className="ml-1 h-3 w-3" />
                            </Button>
                        </Link>
                    </div>

                    {activeNumbers.length > 0 ? (
                        <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
                            {activeNumbers.map((num) => (
                                <div key={num.id} className="snap-center shrink-0 w-[240px] p-4 rounded-2xl bg-[#12141a] border border-white/[0.06] relative group overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--neon-lime)/0.03)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                    <div className="flex items-start justify-between mb-3">
                                        <div className="text-xs font-bold px-2 py-1 rounded bg-white/[0.06] text-gray-300">{num.countryName}</div>
                                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px] bg-emerald-500/10">Active</Badge>
                                    </div>

                                    <div className="space-y-1">
                                        <p className="text-xl font-mono font-medium text-white tracking-wide">{num.number}</p>
                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                            {num.serviceName} • <span className="text-[hsl(var(--neon-lime))]">{num.smsCount} SMS</span>
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-6 rounded-2xl bg-[#12141a] border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
                                <Phone className="h-6 w-6 text-gray-500" />
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">No active numbers yet.</p>
                            <Link href="/dashboard/buy">
                                <Button size="sm" className="bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)] font-semibold">
                                    Get a Number
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
                    <h3 className="text-lg font-semibold text-white px-1">Recent Activity</h3>
                    <div className="space-y-2">
                        {transactions.slice(0, 3).map((tx, j) => (
                            <div key={j} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'topup' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-indigo-500/10 text-indigo-500'
                                        }`}>
                                        {tx.type === 'topup' ? <ArrowUpRight className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">{tx.description}</p>
                                        <p className="text-[10px] text-gray-500">Just now</p>
                                    </div>
                                </div>
                                <span className={`text-sm font-mono font-medium ${tx.amount > 0 ? 'text-emerald-400' : 'text-white'}`}>
                                    {tx.amount > 0 ? '+' : ''}{formatPrice(tx.amount)}
                                </span>
                            </div>
                        ))}
                        {transactions.length === 0 && (
                            <p className="text-sm text-muted-foreground px-2">No recent activity.</p>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
