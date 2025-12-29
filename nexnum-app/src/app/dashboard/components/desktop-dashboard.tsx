import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
    Wallet,
    Phone,
    TrendingUp,
    ArrowRight,
    MessageSquare,
    Plus,
    Sparkles,
    History,
    Clock,
    ChevronRight,
    Zap,
    Shield,
    Copy,
    Check,
    Bell,
    ArrowUpRight,
    CreditCard,
    Gift,
    ShoppingCart
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BalanceRing } from "@/components/ui/balance-ring"
import { useGlobalStore } from "@/store"
import { formatPrice, formatRelativeTime } from "@/lib/utils"
import { toast } from "sonner"
import { NotificationsBtn } from "./shared"

const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }
}

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 }
    }
}

const scaleIn = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, type: "spring" as const, stiffness: 300 } }
}

const DesktopCardDecoration = ({ variant }: { variant: 'circles' | 'lines' | 'grid' | 'dots' }) => {
    switch (variant) {
        case 'circles':
            return (
                <svg className="absolute top-0 right-0 w-32 h-32 opacity-[0.06] pointer-events-none" viewBox="0 0 100 100">
                    <circle cx="80" cy="20" r="20" fill="currentColor" />
                    <circle cx="80" cy="20" r="30" stroke="currentColor" strokeWidth="1" fill="none" />
                    <circle cx="40" cy="10" r="6" fill="currentColor" />
                    <circle cx="10" cy="40" r="4" fill="currentColor" opacity="0.5" />
                </svg>
            )
        case 'lines':
            return (
                <svg className="absolute bottom-0 left-0 w-full h-24 opacity-[0.05] pointer-events-none" viewBox="0 0 200 60">
                    <path d="M0 60 L60 0 M20 60 L80 0 M40 60 L100 0 M60 60 L120 0" stroke="currentColor" strokeWidth="1.5" />
                </svg>
            )
        case 'grid':
            return (
                <svg className="absolute top-4 right-4 w-24 h-24 opacity-[0.07] pointer-events-none" viewBox="0 0 40 40">
                    <pattern id="desktop-grid" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                        <path d="M0 0h1v1H0z" fill="currentColor" />
                    </pattern>
                    <rect width="40" height="40" fill="url(#desktop-grid)" />
                    <rect x="10" y="10" width="20" height="20" stroke="currentColor" strokeWidth="0.5" fill="none" />
                </svg>
            )
        case 'dots':
            return (
                <svg className="absolute top-0 right-0 w-28 h-28 opacity-[0.08] pointer-events-none overflow-visible" viewBox="0 0 80 80">
                    <circle cx="70" cy="10" r="3" fill="currentColor" />
                    <circle cx="60" cy="25" r="2" fill="currentColor" />
                    <circle cx="45" cy="15" r="1.5" fill="currentColor" />
                    <circle cx="55" cy="45" r="1" fill="currentColor" />
                    <path d="M65 15 L75 5" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                </svg>
            )
        default:
            return null
    }
}

function ActiveNumberCard({ number, onCopy }: { number: any; onCopy: (num: string) => void }) {
    const [copied, setCopied] = useState(false)
    const expiresAt = new Date(number.expiresAt)
    const now = new Date()
    const timeLeft = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
    const minutesLeft = Math.floor(timeLeft / 60)

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault()
        navigator.clipboard.writeText(number.number)
        setCopied(true)
        toast.success("Number copied!")
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Link href={`/sms/${encodeURIComponent(number.number)}`}>
            <motion.div
                whileHover={{ scale: 1.01 }}
                className="relative group"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity blur-lg" />
                <div className="relative p-4 rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border border-white/5 hover:border-emerald-500/30 transition-all duration-300">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center border border-emerald-500/20 overflow-hidden">
                                <img
                                    src={`https://flagcdn.com/w40/${number.countryCode?.toLowerCase() || 'us'}.png`}
                                    alt={number.countryName}
                                    className="w-6 h-4 object-cover rounded-sm"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://flagcdn.com/w40/us.png'
                                    }}
                                />
                            </div>
                            <div>
                                <p className="font-mono font-bold text-sm group-hover:text-emerald-400 transition-colors">
                                    {number.number}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <span>{number.serviceName}</span>
                                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                    <img
                                        src={`https://flagcdn.com/w20/${number.countryCode?.toLowerCase() || 'us'}.png`}
                                        alt={number.countryName}
                                        className="w-4 h-3 object-cover rounded-[2px] inline-block"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none'
                                        }}
                                    />
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                                variant={minutesLeft > 5 ? "success" : "destructive"}
                                className="text-[10px] gap-0.5 py-0.5 px-1.5"
                            >
                                <Clock className="h-2.5 w-2.5" />
                                {minutesLeft}m
                            </Badge>

                            <Badge variant="secondary" className="text-[10px] gap-0.5 py-0.5 px-1.5">
                                <MessageSquare className="h-2.5 w-2.5" />
                                {number.smsCount}
                            </Badge>

                            <button
                                onClick={handleCopy}
                                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                {copied ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </Link>
    )
}

import { PhoneMockup } from "./phone-mockup"

// ... existing imports

export function DesktopDashboard() {
    const { user, activeNumbers, transactions } = useGlobalStore()
    const [greeting, setGreeting] = useState("Hello")

    // ... existing hooks

    const totalSpent = transactions
        .filter(t => t.type === "purchase")
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    const totalDeposit = transactions
        .filter(t => t.type === "topup")
        .reduce((sum, t) => sum + t.amount, 0)

    // Mouse tracking for cursor glow
    const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
    useEffect(() => {
        const updateMousePosition = (ev: MouseEvent) => {
            setMousePosition({ x: ev.clientX, y: ev.clientY })
        }
        window.addEventListener('mousemove', updateMousePosition)
        return () => window.removeEventListener('mousemove', updateMousePosition)
    }, [])

    return (
        <div className="min-h-full relative overflow-hidden bg-background selection:bg-emerald-500/30">
            {/* ... backgrounds ... */}

            < div className="p-8 relative z-10" >
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                    className="space-y-6 max-w-7xl mx-auto"
                >
                    {/* Hero Section with 3D Element */}
                    <div className="flex items-center justify-between mb-8">
                        <motion.div variants={fadeInUp} className="flex-1 max-w-2xl relative z-10">
                            <h1 className="text-5xl md:text-6xl font-bold mb-4 leading-tight tracking-tight">
                                {greeting}, <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white/80 to-white/50">{user?.name?.split(" ")[0]}</span>
                            </h1>
                            <p className="text-muted-foreground text-lg mb-8 max-w-lg">
                                Manage your virtual presence with premium numbers. Secure, instant, and private communication at your fingertips.
                            </p>

                            <div className="flex items-center gap-4">
                                <Link href="/buy">
                                    <Button variant="emerald" className="gap-2 h-14 px-8 rounded-2xl shadow-2xl shadow-emerald-500/20 font-bold text-lg hover:scale-105 transition-transform duration-300">
                                        <ShoppingCart className="h-5 w-5" />
                                        <span>Start Purchasing</span>
                                        <ArrowRight className="h-5 w-5 ml-1" />
                                    </Button>
                                </Link>
                                <NotificationsBtn />
                            </div>
                        </motion.div>

                        {/* 3D Visual - Desktop Only */}
                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className="hidden lg:block relative -mr-12"
                        >
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />
                            <PhoneMockup />
                        </motion.div>
                    </div>

                    {/* Stats Overview Row */}


// Vector Accents for Desktop Cards (Matching Mobile Style)


                    // ... inside DesktopDashboard ...

                    {/* Stats Overview Row */}
                    <motion.div variants={fadeInUp} className="grid grid-cols-4 gap-4 relative">
                        {/* Decorative Grid Lines */}
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute top-4 bottom-4 left-1/4 w-px bg-gradient-to-b from-transparent via-white/5 to-transparent -translate-x-1/2" />
                            <div className="absolute top-4 bottom-4 left-2/4 w-px bg-gradient-to-b from-transparent via-white/5 to-transparent -translate-x-1/2" />
                            <div className="absolute top-4 bottom-4 left-3/4 w-px bg-gradient-to-b from-transparent via-white/5 to-transparent -translate-x-1/2" />
                        </div>

                        {[
                            {
                                label: "Balance",
                                value: formatPrice(user?.balance || 0),
                                icon: Wallet,
                                gradient: "from-cyan-500 to-sky-600",
                                bgGradient: "from-cyan-500/10 to-sky-500/10",
                                decoration: "circles" as const
                            },
                            {
                                label: "Active Numbers",
                                value: activeNumbers.length.toString(),
                                icon: Phone,
                                gradient: "from-violet-500 to-purple-600",
                                bgGradient: "from-violet-500/10 to-purple-500/10",
                                decoration: "grid" as const
                            },
                            {
                                label: "Total Spent",
                                value: formatPrice(totalSpent),
                                icon: MessageSquare,
                                gradient: "from-rose-500 to-pink-600",
                                bgGradient: "from-rose-500/10 to-pink-500/10",
                                decoration: "lines" as const
                            },
                            {
                                label: "Total Deposit",
                                value: formatPrice(totalDeposit),
                                icon: TrendingUp,
                                gradient: "from-emerald-500 to-teal-600",
                                bgGradient: "from-emerald-500/10 to-teal-500/10",
                                decoration: "dots" as const
                            }
                        ].map((stat, index) => (
                            <motion.div
                                key={stat.label}
                                variants={scaleIn}
                                className="relative group overflow-hidden"
                            >
                                <div className={`absolute inset-0 bg-gradient-to-r ${stat.bgGradient} rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-300`} />

                                <div className="relative p-5 rounded-2xl bg-card/60 backdrop-blur-xl border border-white/10 hover:border-white/20 transition-all overflow-hidden h-full">
                                    {/* Component Level Decoration */}
                                    <DesktopCardDecoration variant={stat.decoration} />

                                    {/* Shimmer Effect */}
                                    <motion.div
                                        animate={{ x: ["-100%", "200%"] }}
                                        transition={{
                                            duration: 2.5,
                                            repeat: Infinity,
                                            repeatDelay: 4 + index * 0.5,
                                            ease: "linear"
                                        }}
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -skew-x-12 pointer-events-none"
                                    />

                                    <div className="flex items-center justify-between relative z-10">
                                        <div>
                                            <p className="text-xs text-muted-foreground mb-0.5">{stat.label}</p>
                                            <p className="text-2xl font-bold">{stat.value}</p>
                                        </div>
                                        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg shrink-0`}>
                                            <stat.icon className="h-5 w-5 text-white" />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-3 gap-6">
                        {/* Left Column */}
                        <motion.div variants={fadeInUp} className="col-span-1 space-y-6">
                            {/* Premium Wallet Card */}
                            <Card className="relative overflow-hidden border-white/10 bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-xl">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-full blur-2xl" />
                                <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 rounded-full blur-2xl" />

                                <motion.div
                                    animate={{ x: ["-100%", "200%"] }}
                                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: "linear" }}
                                    className="absolute inset-0 z-10 bg-gradient-to-tr from-transparent via-white/[0.07] to-transparent -skew-x-12 pointer-events-none"
                                />

                                <CardContent className="p-6 relative">
                                    <div className="flex flex-col items-center gap-6">
                                        <div className="w-full flex justify-center pt-2">
                                            <div className="transform-gpu">
                                                <BalanceRing
                                                    balance={user?.balance || 50}
                                                    spent={totalSpent}
                                                    deposit={totalDeposit}
                                                    size={180}
                                                    strokeWidth={16}
                                                />
                                            </div>
                                        </div>

                                        <div className="w-full mb-2">
                                            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                                        </div>

                                        <div className="flex flex-col gap-2 w-full">
                                            <Link href="/dashboard/wallet">
                                                <Button variant="glass" className="w-full gap-2 rounded-xl h-9 text-xs whitespace-nowrap shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20">
                                                    <CreditCard className="h-3 w-3" />
                                                    Add Funds
                                                </Button>
                                            </Link>
                                            <Link href="/dashboard/history">
                                                <Button variant="glass" className="w-full gap-2 rounded-xl h-9 text-xs whitespace-nowrap shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20">
                                                    <History className="h-3 w-3" />
                                                    History
                                                </Button>
                                            </Link>
                                            <Link href="/dashboard/redeem">
                                                <Button variant="glass" className="w-full h-9 gap-2 rounded-xl text-xs whitespace-nowrap shadow-lg shadow-pink-500/10 hover:shadow-pink-500/20 group">
                                                    <Gift className="w-3 h-3 text-pink-400 transition-transform group-hover:scale-110" />
                                                    Redeem Code
                                                </Button>
                                            </Link>
                                            <Link href="/dashboard/referrals">
                                                <Button variant="glass" className="w-full h-9 gap-2 rounded-xl text-xs whitespace-nowrap shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 group">
                                                    <Sparkles className="w-3 h-3 text-purple-400 transition-transform group-hover:scale-110" />
                                                    Referral Bonus
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Right Column */}
                        <motion.div variants={fadeInUp} className="col-span-2 grid grid-cols-2 gap-6">
                            {/* Active Numbers */}
                            <Card className="border-white/10 bg-card/50 backdrop-blur-xl overflow-hidden col-span-2">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
                                                <Phone className="h-4 w-4 text-emerald-500" />
                                            </div>
                                            Last Purchased
                                        </CardTitle>
                                        <Link href="/dashboard/vault">
                                            <Button variant="ghost" size="sm" className="gap-1 text-xs">
                                                View All
                                                <ChevronRight className="h-3 w-3" />
                                            </Button>
                                        </Link>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    {activeNumbers.length === 0 ? (
                                        <div className="text-center py-12">
                                            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 flex items-center justify-center">
                                                <Phone className="h-10 w-10 text-emerald-500/50" />
                                            </div>
                                            <h3 className="text-lg font-semibold mb-2">No Active Numbers</h3>
                                            <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
                                                Get your first virtual number to start receiving SMS verifications
                                            </p>
                                            <Link href="/buy">
                                                <Button variant="emerald" className="gap-2 rounded-xl">
                                                    <Plus className="h-4 w-4" />
                                                    Get Your First Number
                                                </Button>
                                            </Link>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <AnimatePresence>
                                                {activeNumbers.slice(0, 4).map((number, i) => (
                                                    <motion.div
                                                        key={number.id}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                    >
                                                        <ActiveNumberCard
                                                            number={number}
                                                            onCopy={() => { }}
                                                        />
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>

                                            {activeNumbers.length > 4 && (
                                                <Link href="/dashboard/vault">
                                                    <Button variant="ghost" className="w-full mt-2 text-muted-foreground hover:text-foreground">
                                                        View {activeNumbers.length - 4} more numbers
                                                        <ChevronRight className="h-4 w-4 ml-1" />
                                                    </Button>
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                    {/* Bottom CTA Banner */}
                    <motion.div variants={fadeInUp}>
                        <Card className="relative overflow-hidden border-white/10 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-emerald-500/10 backdrop-blur-xl">
                            <div className="absolute inset-0">
                                <div className="absolute top-0 left-1/4 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl" />
                                <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl" />
                            </div>

                            <CardContent className="p-8 relative">
                                <div className="flex flex-row items-center justify-between gap-6">
                                    <div className="flex items-center gap-4 text-left">
                                        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
                                            <Zap className="h-8 w-8 text-amber-500" />
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-start gap-2 mb-2">
                                                <Sparkles className="h-5 w-5 text-amber-500" />
                                                <h3 className="text-xl font-bold">Ready for more?</h3>
                                            </div>
                                            <p className="text-muted-foreground max-w-md">
                                                Get virtual numbers from 180+ countries with instant SMS delivery.
                                                Starting from just <span className="text-emerald-400 font-semibold">$0.08</span>
                                            </p>
                                        </div>
                                    </div>

                                    <Link href="/buy" className="shrink-0 w-auto">
                                        <Button variant="emerald" size="lg" className="gap-2 h-12 rounded-xl shadow-lg shadow-emerald-500/25">
                                            <Sparkles className="h-4 w-4" />
                                            Smart Buy
                                            <ArrowRight className="h-4 w-4" />
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </motion.div>
            </div >
        </div >
    )
}
