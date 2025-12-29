import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
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
    Copy,
    Check,
    CreditCard,
    Gift,
    ShoppingCart
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { formatPrice, formatRelativeTime } from "@/lib/utils"
import { toast } from "sonner"
import { NotificationsBtn } from "./shared"

// Vector Accents for Mobile Cards
const CardDecoration = ({ variant }: { variant: 'circles' | 'lines' | 'grid' | 'dots' }) => {
    switch (variant) {
        case 'circles':
            return (
                <svg className="absolute top-0 right-0 w-24 h-24 opacity-[0.03] pointer-events-none" viewBox="0 0 100 100">
                    <circle cx="80" cy="20" r="16" fill="currentColor" />
                    <circle cx="80" cy="20" r="24" stroke="currentColor" strokeWidth="1" fill="none" />
                    <circle cx="50" cy="10" r="4" fill="currentColor" />
                </svg>
            )
        case 'lines':
            return (
                <svg className="absolute bottom-0 left-0 w-full h-16 opacity-[0.03] pointer-events-none" viewBox="0 0 200 60">
                    <path d="M0 60 L60 0 M20 60 L80 0 M40 60 L100 0" stroke="currentColor" strokeWidth="2" />
                </svg>
            )
        case 'grid':
            return (
                <svg className="absolute top-2 right-2 w-16 h-16 opacity-[0.04] pointer-events-none" viewBox="0 0 40 40">
                    <pattern id="grid" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="1" fill="currentColor" />
                    </pattern>
                    <rect width="40" height="40" fill="url(#grid)" />
                </svg>
            )
        case 'dots':
            return (
                <svg className="absolute top-0 right-0 w-20 h-20 opacity-[0.04] pointer-events-none overflow-visible" viewBox="0 0 80 80">
                    <circle cx="70" cy="10" r="2" fill="currentColor" />
                    <circle cx="60" cy="25" r="1.5" fill="currentColor" />
                    <circle cx="45" cy="15" r="1" fill="currentColor" />
                    <path d="M65 15 L75 5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
                </svg>
            )
        default:
            return null
    }
}

function MetricCard({
    label,
    value,
    decoration,
    delay
}: {
    label: string
    value: string
    decoration: 'circles' | 'lines' | 'grid' | 'dots'
    delay: number
}) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, duration: 0.4 }}
            className="relative overflow-hidden p-4 rounded-xl bg-card border border-white/5 active:scale-[0.98] transition-all"
        >
            <CardDecoration variant={decoration} />
            <div className="relative z-10">
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider opacity-80">{label}</p>
                <p className="text-xl font-bold tracking-tight">{value}</p>
            </div>
            {/* Subtle Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        </motion.div>
    )
}

// Simplified animation variants for mobile
const fadeIn = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
}

function MobileActiveNumberCard({ number }: { number: any }) {
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
            <div className="active:scale-[0.98] transition-transform duration-200">
                <div className="relative p-4 rounded-xl bg-card border border-white/5 active:border-emerald-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center border border-white/5 overflow-hidden">
                                <img
                                    src={`https://flagcdn.com/w40/${number.countryCode?.toLowerCase() || 'us'}.png`}
                                    alt={number.countryName}
                                    className="w-6 h-4 object-cover rounded-sm"
                                />
                            </div>
                            <div>
                                <p className="font-mono font-bold text-sm tracking-wide">
                                    {number.number}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <span>{number.serviceName}</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={minutesLeft > 5 ? "success" : "destructive"} className="text-[10px] h-6 px-2">
                                {minutesLeft}m
                            </Badge>

                            <button
                                onClick={handleCopy}
                                className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/50 text-muted-foreground"
                            >
                                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    )
}

export function MobileDashboard() {
    const { user, activeNumbers, transactions } = useGlobalStore()
    const [greeting, setGreeting] = useState("Hello")

    useEffect(() => {
        const hour = new Date().getHours()
        if (hour < 12) setGreeting("Good morning")
        else if (hour < 18) setGreeting("Good afternoon")
        else setGreeting("Good evening")
    }, [])

    const totalSpent = transactions
        .filter(t => t.type === "purchase")
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    const totalDeposit = transactions
        .filter(t => t.type === "topup")
        .reduce((sum, t) => sum + t.amount, 0)

    const recentTransactions = transactions.slice(0, 5)

    return (
        <div className="min-h-full pb-20 bg-background">
            {/* Simple CSS Gradient Background - Performance optimized */}
            <div className="fixed inset-0 bg-[#09090b] pointer-events-none -z-10" />
            <div className="fixed top-0 right-0 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none -z-10" />
            <div className="fixed bottom-0 left-0 w-[200px] h-[200px] bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none -z-10" />

            <div className="p-4 space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">
                                {greeting}, <span className="text-primary">{user?.name?.split(" ")[0]}</span>
                            </h1>
                            <p className="text-sm text-muted-foreground">Welcome back</p>
                        </div>
                        <NotificationsBtn />
                    </div>


                    {/* Stats Grid - CSS Grid for simple layout */}
                    <div className="grid grid-cols-2 gap-3">
                        <MetricCard
                            label="Balance"
                            value={formatPrice(user?.balance || 0)}
                            decoration="circles"
                            delay={0.1}
                        />
                        <MetricCard
                            label="Active"
                            value={activeNumbers.length.toString()}
                            decoration="grid"
                            delay={0.15}
                        />
                        <MetricCard
                            label="Spent"
                            value={formatPrice(totalSpent)}
                            decoration="lines"
                            delay={0.2}
                        />
                        <MetricCard
                            label="Deposit"
                            value={formatPrice(totalDeposit)}
                            decoration="dots"
                            delay={0.25}
                        />
                    </div>

                    {/* Smart Buy CTA */}
                    <Link href="/buy">
                        <Button className="w-full h-12 text-base font-semibold shadow-lg shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                            <ShoppingCart className="mr-2 h-5 w-5" />
                            Smart Buy
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </div>

                {/* Quick Actions - Scrollable Row */}
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <Link href="/dashboard/wallet">
                            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 active:scale-95 transition-transform">
                                <CreditCard className="h-6 w-6 text-indigo-400 mb-2" />
                                <span className="text-sm font-medium">Add Funds</span>
                            </div>
                        </Link>
                        <Link href="/dashboard/history">
                            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 active:scale-95 transition-transform">
                                <History className="h-6 w-6 text-purple-400 mb-2" />
                                <span className="text-sm font-medium">History</span>
                            </div>
                        </Link>
                        <Link href="/dashboard/redeem">
                            <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 active:scale-95 transition-transform">
                                <Gift className="h-6 w-6 text-pink-400 mb-2" />
                                <span className="text-sm font-medium">Redeem</span>
                            </div>
                        </Link>
                        <Link href="/dashboard/referrals">
                            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 active:scale-95 transition-transform">
                                <Sparkles className="h-6 w-6 text-amber-400 mb-2" />
                                <span className="text-sm font-medium">Bonus</span>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Active Numbers */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Numbers</h3>
                        {activeNumbers.length > 0 && (
                            <Link href="/dashboard/vault" className="text-xs text-emerald-400">View All</Link>
                        )}
                    </div>

                    {activeNumbers.length === 0 ? (
                        <div className="text-center py-8 bg-card/30 rounded-xl border border-white/5 border-dashed">
                            <div className="flex justify-center mb-3">
                                <div className="p-3 bg-emerald-500/10 rounded-full">
                                    <Phone className="h-6 w-6 text-emerald-500" />
                                </div>
                            </div>
                            <p className="text-sm font-medium mb-1">No numbers yet</p>
                            <p className="text-xs text-muted-foreground mb-4">Get your first number today</p>
                            <Link href="/buy">
                                <Button size="sm" variant="outline" className="border-emerald-500/30 text-emerald-500">
                                    Browse Numbers
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeNumbers.slice(0, 3).map((number) => (
                                <MobileActiveNumberCard key={number.id} number={number} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Activity */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h3>
                    </div>
                    <div className="bg-card/50 rounded-xl border border-white/5 divide-y divide-white/5">
                        {recentTransactions.length === 0 ? (
                            <div className="p-6 text-center text-sm text-muted-foreground">No recent activity</div>
                        ) : (
                            recentTransactions.slice(0, 5).map((tx) => (
                                <div key={tx.id} className="p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${tx.type === 'topup' ? 'bg-emerald-500/10 text-emerald-500' :
                                            tx.type === 'purchase' ? 'bg-indigo-500/10 text-indigo-500' :
                                                'bg-amber-500/10 text-amber-500'
                                            }`}>
                                            {tx.type === 'topup' ? <TrendingUp className="h-4 w-4" /> :
                                                tx.type === 'purchase' ? <ShoppingCart className="h-4 w-4" /> :
                                                    <Gift className="h-4 w-4" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{tx.description}</p>
                                            <p className="text-xs text-muted-foreground">{formatRelativeTime(tx.createdAt)}</p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-medium ${tx.amount >= 0 ? 'text-emerald-500' : ''}`}>
                                        {tx.amount > 0 ? '+' : ''}{formatPrice(tx.amount)}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
