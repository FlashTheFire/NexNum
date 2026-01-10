"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
    LayoutDashboard,
    History,
    Archive,
    Wallet,
    LogOut,
    ChevronLeft,
    Phone,
    Settings,
    HelpCircle,
    Sparkles,
    Menu,
    X,
    ChevronRight,
    ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle, ThemeToggleIcon } from "@/components/common/theme-toggle"
import { Navbar } from "@/components/common/navbar"
import { useGlobalStore } from "@/store"
import { cn, formatPrice } from "@/lib/utils"
import { useAuthStore } from "@/stores/authStore"
import DashboardMobileActionBar from "@/components/common/DashboardMobileActionBar"
import LoadingScreen from "@/components/ui/LoadingScreen"

const navItems = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, description: "Dashboard home" },
    { href: "/dashboard/vault", label: "Number Vault", icon: Archive, description: "Your active numbers" },
    { href: "/dashboard/history", label: "History", icon: History, description: "Transaction history" },
    { href: "/dashboard/wallet", label: "Wallet", icon: Wallet, description: "Manage funds" },
    // Admin Link will be conditionally rendered in the component, or we check role here?
    // Better to check in component rendering loop or filter this list.
]

const bottomNavItems = [
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
    { href: "/help", label: "Help", icon: HelpCircle },
]

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const router = useRouter()
    const { isAuthenticated, user, logout, checkAuth, isLoading } = useAuthStore()
    const { sidebarCollapsed, toggleSidebar, _hasHydrated, fetchBalance, fetchNumbers, fetchTransactions } = useGlobalStore()
    useEffect(() => {
        checkAuth()
    }, [checkAuth])

    // Initial fetch
    useEffect(() => {
        if (isAuthenticated && !isLoading) {
            fetchBalance()
            // Only fetch numbers on exact /dashboard route (not sub-routes)
            if (pathname === '/dashboard') {
                fetchNumbers()
            }
            fetchTransactions()
        }
    }, [isAuthenticated, isLoading, pathname, fetchBalance, fetchNumbers, fetchTransactions])

    // Background Polling (Logical & Professional Advance)
    useEffect(() => {
        if (!isAuthenticated || isLoading) return

        const interval = setInterval(() => {
            fetchBalance()
            // Only poll numbers on exact /dashboard route
            if (pathname === '/dashboard') {
                fetchNumbers()
            }
            // No need to poll transactions as frequently, but can if needed
        }, 20000) // 20 seconds

        return () => clearInterval(interval)
    }, [isAuthenticated, isLoading, pathname, fetchBalance, fetchNumbers])

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push("/login")
        }
    }, [isLoading, isAuthenticated, router])

    const handleLogout = async () => {
        await logout()
        router.push("/")
    }

    if (isLoading) {
        return <LoadingScreen status="Preparing Dashboard" />
    }

    if (!isAuthenticated) {
        return null
    }

    return (
        <div className="min-h-screen bg-[#0a0a0c]">
            <Navbar />
            <div className="flex relative items-stretch min-h-[calc(100vh-4rem)]">
                {/* Desktop Sidebar */}
                <motion.aside
                    initial={false}
                    animate={{ width: sidebarCollapsed ? 80 : 280 }}
                    className="hidden lg:flex flex-col border-r border-white/[0.06] bg-[#0a0a0c]/90 backdrop-blur-2xl shadow-2xl relative z-20"
                >
                    {/* Sidebar Glow Effect */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="absolute top-1/4 -left-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
                        <div className="absolute bottom-1/4 -left-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-3 space-y-1 relative flex flex-col">
                        <div className="flex-1 space-y-1">
                            {navItems.map((item, index) => {
                                const isActive = pathname === item.href
                                const isFirst = index === 0

                                return (
                                    <div key={item.href}>
                                        <Link
                                            href={item.href}
                                            className="block"
                                        >
                                            <motion.div
                                                whileHover={{ x: sidebarCollapsed ? 0 : 4 }}
                                                whileTap={{ scale: 0.98 }}
                                                className={cn(
                                                    "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                                                    isActive
                                                        ? "bg-white/[0.08] text-white shadow-sm"
                                                        : "text-gray-400 hover:text-white hover:bg-white/[0.04]",
                                                    sidebarCollapsed && "justify-center px-2"
                                                )}
                                            >
                                                {isActive && (
                                                    <motion.div
                                                        layoutId="activeNav"
                                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[hsl(var(--neon-lime))] rounded-r-full shadow-[0_0_8px_hsl(var(--neon-lime)/0.5)]"
                                                    />
                                                )}
                                                <item.icon className={cn(
                                                    "h-5 w-5 transition-colors shrink-0",
                                                    isActive ? "text-[hsl(var(--neon-lime))]" : "text-gray-400 group-hover:text-white"
                                                )} />
                                                {!sidebarCollapsed && (
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-medium">{item.label}</span>
                                                    </div>
                                                )}
                                            </motion.div>
                                        </Link>
                                    </div>
                                )
                            })}

                            {/* Admin Link */}
                            {user?.role === 'ADMIN' && (
                                <Link href="/admin" className="block mt-2">
                                    <motion.div
                                        whileHover={{ x: sidebarCollapsed ? 0 : 4 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={cn(
                                            "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group border border-[hsl(var(--neon-lime))/20] bg-[hsl(var(--neon-lime))/5] hover:bg-[hsl(var(--neon-lime))/10]",
                                            sidebarCollapsed && "justify-center px-2"
                                        )}
                                    >
                                        <div className="text-[hsl(var(--neon-lime))]">
                                            <Settings className="h-5 w-5" />
                                        </div>
                                        {!sidebarCollapsed && (
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-bold text-[hsl(var(--neon-lime))]">Admin Panel</span>
                                            </div>
                                        )}
                                    </motion.div>
                                </Link>
                            )}

                            {/* Dedicated Toggle Button - Moved Below Nav Items */}
                            <div className="pt-2 border-t border-white/5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={toggleSidebar}
                                    className={cn(
                                        "w-full flex items-center justify-center h-8 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all",
                                        !sidebarCollapsed && "justify-end pr-2"
                                    )}
                                >
                                    {sidebarCollapsed ? (
                                        <ArrowRight className="h-4 w-4" />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs uppercase tracking-wider">Collapse</span>
                                            <ChevronLeft className="h-4 w-4" />
                                        </div>
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Logout Nav Item */}
                        <div className="mt-auto space-y-1">
                            <motion.div
                                whileHover={{ x: sidebarCollapsed ? 0 : 4 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleLogout}
                                className={cn(
                                    "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group cursor-pointer",
                                    "hover:bg-destructive/10 text-muted-foreground hover:text-destructive",
                                    sidebarCollapsed && "justify-center px-2"
                                )}
                            >
                                <LogOut className={cn("h-5 w-5 transition-colors", sidebarCollapsed && "ml-0.5")} />
                                {!sidebarCollapsed && (
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium">Logout</span>
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    </nav>

                    {/* Bottom Section */}
                    <div className="p-3 border-t border-white/10 space-y-3">
                        {/* Theme Toggle */}
                        <div className={cn(
                            "flex items-center gap-3 px-2",
                            sidebarCollapsed ? "justify-center" : "justify-between"
                        )}>
                            {!sidebarCollapsed ? (
                                <>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Theme</span>
                                    <ThemeToggle />
                                </>
                            ) : (
                                <ThemeToggleIcon />
                            )}
                        </div>

                        {!sidebarCollapsed && bottomNavItems.map((item) => (
                            <Link key={item.href} href={item.href}>
                                <div className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
                                )}>
                                    <item.icon className="h-4 w-4" />
                                    <span className="text-sm">{item.label}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </motion.aside>

                {/* Main Content */}
                <main className="flex-1 overflow-auto pb-20 lg:pb-0">
                    {children}
                </main>
            </div>
            <DashboardMobileActionBar />
        </div >
    )
}
