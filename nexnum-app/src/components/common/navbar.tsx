"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
    Menu,
    X,
    Wallet,
    LogOut,
    LayoutDashboard,
    ShoppingCart,
    User,
    ChevronDown,
    Zap,
    Bell,
    Check,
    Trash2,
    Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useGlobalStore } from "@/stores/appStore"
import { useAuthStore } from "@/stores/authStore"
import { cn } from "@/lib/utils/utils"
import { useNotifications, formatNotificationTime } from "@/hooks/use-notifications"
import { NotificationDropdown } from "@/components/common/notification-dropdown"
import LanguageSwitcher from "@/components/common/LanguageSwitcher"
import CurrencySelector from "@/components/common/CurrencySelector"
import { useCurrency } from "@/providers/CurrencyProvider"

export function Navbar() {
    const pathname = usePathname()
    const { isAuthenticated, user, logout } = useAuthStore()
    const { userProfile } = useGlobalStore()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [scrolled, setScrolled] = useState(false)
    const { formatBalance } = useCurrency()


    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    return (
        <>
            <motion.nav
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                className={cn(
                    "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
                    scrolled
                        ? "bg-[#0a0a0c]/90 backdrop-blur-2xl border-b border-white/[0.06] shadow-2xl shadow-black/20"
                        : "bg-transparent"
                )}
            >
                <div className="container mx-auto px-4 lg:px-6">
                    {/* User Provided Structure: h-16 lg:h-[72px] flex items-center justify-between */}
                    <div className="h-16 lg:h-[72px] flex items-center justify-between">

                        {/* 1. Logo Section (Exact Style) */}
                        <Link href="/" className="flex items-center gap-3 group">
                            <div className="relative">
                                <div className="w-10 h-10 bg-gradient-to-br from-[hsl(var(--neon-lime))] to-[hsl(72,70%,40%)] rounded-xl flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] group-hover:shadow-[hsl(var(--neon-lime)/0.4)] transition-all duration-300 group-hover:scale-105 p-1.5">
                                    <Image
                                        alt="NexNum Logo"
                                        loading="lazy"
                                        width="28"
                                        height="28"
                                        decoding="async"
                                        className="text-black invert-0"
                                        style={{ color: "transparent", filter: "brightness(0)" }}
                                        src="/assets/brand/nexnum-logo.svg"
                                    />
                                </div>
                                <div className="absolute inset-0 bg-[hsl(var(--neon-lime))] rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-xl tracking-tight text-white leading-none">
                                    Nex<span className="text-[hsl(var(--neon-lime))]">Num</span>
                                </span>
                                <span className="text-[10px] text-gray-500 tracking-widest uppercase">Virtual Numbers</span>
                            </div>
                        </Link>

                        {/* 2. Center Navigation (Context Aware - Dashboard Links) */}
                        <div className="hidden lg:flex items-center">
                            <div className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                                {[
                                    { href: "/dashboard", label: "Overview" },
                                    { href: "/dashboard/vault", label: "My Numbers" },
                                    { href: "/dashboard/wallet", label: "Wallet" },
                                    { href: "/api-docs", label: "Developers", icon: ChevronDown }
                                ].map((link) => (
                                    <Link key={link.href} href={link.href} className={cn(
                                        "px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 flex items-center gap-1",
                                        pathname === link.href ? "text-white bg-white/[0.06]" : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                                    )}>
                                        {link.label}
                                        {link.icon && <link.icon className="w-3 h-3" />}
                                    </Link>
                                ))}
                            </div>
                        </div>

                        {/* 3. Right Actions (User Profile / Auth) */}
                        <div className="hidden lg:flex items-center gap-3">
                            {isAuthenticated ? (
                                <>
                                    {/* Quick Wallet Info */}
                                    <Link href="/dashboard/wallet">
                                        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 py-2 text-gray-300 hover:text-white hover:bg-white/[0.06] font-medium h-10 px-5 gap-2">
                                            <Wallet className="h-4 w-4 text-[hsl(var(--neon-lime))]" />
                                            <span className="font-mono">{formatBalance(userProfile?.balance || 0)}</span>
                                        </button>
                                    </Link>

                                    {/* Desktop Notification Bell */}
                                    <NotificationDropdown />

                                    {/* Language Switcher */}
                                    <div className="mr-1 flex items-center gap-2">
                                        <CurrencySelector />
                                        <LanguageSwitcher />
                                    </div>

                                    {/* Profile / Logout Button */}
                                    <button
                                        onClick={() => logout()}
                                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 py-2 bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)] font-semibold h-10 px-6 shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] hover:shadow-[hsl(var(--neon-lime)/0.4)] transition-all duration-300"
                                    >
                                        <span className="mr-1.5">{user?.name?.split(' ')[0]}</span>
                                        <LogOut className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link href="/login">
                                        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 py-2 text-gray-300 hover:text-white hover:bg-white/[0.06] font-medium h-10 px-5">
                                            Log in
                                        </button>
                                    </Link>
                                    <Link href="/register">
                                        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 py-2 bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)] font-semibold h-10 px-6 shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] hover:shadow-[hsl(var(--neon-lime)/0.4)] transition-all duration-300">
                                            Get Started
                                            <Zap className="w-4 h-4 ml-1.5" />
                                        </button>
                                    </Link>
                                </>
                            )}
                        </div>

                        {/* Mobile Actions (Notification + Menu) */}
                        <div className="flex items-center gap-2 lg:hidden relative">
                            <NotificationDropdown />
                            <LanguageSwitcher />

                            <button
                                className="p-2.5 text-gray-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-all"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            >
                                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu Overlay */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="lg:hidden bg-[#0a0a0c]/98 backdrop-blur-2xl border-t border-white/[0.06] overflow-hidden relative"
                        >
                            {/* Mobile Menu Background Visuals */}
                            <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--neon-lime)/0.05)] to-transparent pointer-events-none" />
                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }}
                            />

                            <div className="p-4 space-y-4 container mx-auto relative z-10">
                                {isAuthenticated && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-indigo-500/20">
                                            {user?.name?.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white">{user?.name}</p>
                                            <p className="text-xs text-gray-400">{user?.email}</p>
                                        </div>
                                        <button
                                            onClick={() => logout()}
                                            className="ml-auto p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                        </button>
                                    </motion.div>
                                )}
                                <div className="space-y-1">
                                    {[
                                        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
                                        { href: "/dashboard/buy", label: "Smart Buy", icon: ShoppingCart },
                                        { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
                                        { href: "/dashboard/settings", label: "Settings", icon: User },
                                    ].map((link, index) => (
                                        <motion.div
                                            key={link.href}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.15 + index * 0.05 }}
                                        >
                                            <Link href={link.href} onClick={() => setMobileMenuOpen(false)}>
                                                <div className="flex items-center gap-3 px-4 py-3.5 text-gray-300 hover:text-white hover:bg-white/[0.04] rounded-xl transition-all font-medium">
                                                    <link.icon className="h-5 w-5 opacity-70" />
                                                    <span>{link.label}</span>
                                                </div>
                                            </Link>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.nav>
            {/* Spacer to prevent layout shift */}
            <div className="h-16 lg:h-[72px]" />
        </>
    )
}
