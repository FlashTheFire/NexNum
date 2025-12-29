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
import { useGlobalStore } from "@/store"
import { cn, formatPrice } from "@/lib/utils"

const navItems = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, description: "Dashboard home" },
    { href: "/dashboard/vault", label: "Number Vault", icon: Archive, description: "Your active numbers" },
    { href: "/dashboard/history", label: "History", icon: History, description: "Transaction history" },
    { href: "/dashboard/wallet", label: "Wallet", icon: Wallet, description: "Manage funds" },
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
    const { isAuthenticated, user, logout, sidebarCollapsed, toggleSidebar, _hasHydrated } = useGlobalStore()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) {
            router.push("/login")
        }
    }, [_hasHydrated, isAuthenticated, router])

    useEffect(() => {
        setMobileMenuOpen(false)
    }, [pathname])

    const handleLogout = () => {
        logout()
        router.push("/")
    }

    if (!_hasHydrated) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading your dashboard...</p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return null
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex relative">
            {/* Desktop Sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: sidebarCollapsed ? 80 : 280 }}
                className="hidden lg:flex flex-col border-r border-white/10 bg-card/30 backdrop-blur-xl relative z-20"
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
                                                    ? "bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-primary border border-indigo-500/20"
                                                    : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                                                sidebarCollapsed && "justify-center px-2"
                                            )}
                                        >
                                            {isActive && (
                                                <motion.div
                                                    layoutId="activeNav"
                                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-r-full"
                                                />
                                            )}
                                            <item.icon className={cn(
                                                "h-5 w-5 transition-colors shrink-0",
                                                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
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
                    </div>

                    {/* Logout Nav Item & Toggle */}
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

                        {/* Dedicated Toggle Button */}
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
                </nav>

                {/* Bottom Section */}
                <div className="p-3 border-t border-white/10 space-y-3">
                    {/* Theme Toggle */}
                    <div className={cn(
                        "flex items-center gap-3 px-2",
                        sidebarCollapsed ? "justify-center" : "justify-between"
                    )}>
                        {!sidebarCollapsed && (
                            <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Theme</span>
                        )}
                        <ThemeToggle />
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

            {/* Mobile Menu Trigger - Fixed Header */}
            <motion.button
                whileTap={{ scale: 0.9 }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden fixed top-5 right-5 z-40 w-10 h-10 rounded-xl shadow-lg shadow-black/10"
            >
                <div className="relative h-full w-full bg-background/80 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/10">
                    <div className="flex flex-col gap-[5px] items-end w-5">
                        <motion.span
                            animate={mobileMenuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                            className="w-full h-0.5 bg-foreground rounded-full origin-center transition-all"
                        />
                        <motion.span
                            animate={mobileMenuOpen ? { opacity: 0 } : { opacity: 1 }}
                            className="w-[70%] h-0.5 bg-foreground rounded-full transition-all"
                        />
                        <motion.span
                            animate={mobileMenuOpen ? { rotate: -45, y: -7, width: "100%" } : { rotate: 0, y: 0, width: "50%" }}
                            className="w-[50%] h-0.5 bg-foreground rounded-full origin-center transition-all"
                        />
                    </div>
                </div>
            </motion.button>

            {/* Mobile Bottom Navigation */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f172a] border-t border-white/5 pb-safe">
                <nav className="flex items-center justify-around p-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href
                        const label = item.label === "Number Vault" ? "Number" : item.label.split(" ")[0]

                        return (
                            <Link key={item.href} href={item.href} className="flex-1 min-w-0">
                                <div className="flex justify-center">
                                    <motion.div
                                        whileTap={{ scale: 0.9 }}
                                        className={cn(
                                            "flex flex-col items-center justify-center w-16 h-14 rounded-2xl transition-all duration-200 gap-1",
                                            isActive
                                                ? "bg-indigo-600/20 text-indigo-400"
                                                : "text-slate-400 hover:text-slate-200"
                                        )}
                                    >
                                        <div className={cn(
                                            "p-1 rounded-lg transition-all",
                                            isActive && "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                                        )}>
                                            <item.icon className="h-5 w-5" />
                                        </div>
                                        <span className={cn(
                                            "text-[10px] font-medium transition-colors",
                                            isActive ? "text-indigo-400" : "text-slate-500"
                                        )}>
                                            {label}
                                        </span>
                                    </motion.div>
                                </div>
                            </Link>
                        )
                    })}
                </nav>
            </div>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileMenuOpen(false)}
                            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="lg:hidden fixed right-0 top-0 bottom-0 w-80 bg-background/95 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col"
                        >
                            {/* Drawer Glow Effect */}
                            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                <div className="absolute top-1/4 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
                                <div className="absolute bottom-1/4 -right-10 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
                            </div>

                            {/* User Info Header (Snippet B) */}
                            <div className="p-4 border-b border-white/10 relative z-10">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Menu</h2>
                                    <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="hover:bg-white/5 rounded-xl">
                                        <X className="h-5 w-5" />
                                    </Button>
                                </div>

                                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/25">
                                        {user?.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold truncate text-sm">{user?.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Navigation Links (Snippet A - Combined Logic) */}
                            <nav className="flex-1 p-4 space-y-1 overflow-y-auto relative z-10 scrollbar-hide">
                                <div className="space-y-1">
                                    <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                                            <span className="font-semibold text-base">Home</span>
                                        </div>
                                    </Link>
                                    <Link href="/buy" onClick={() => setMobileMenuOpen(false)}>
                                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                                            <span className="font-semibold text-base">Smart Buy</span>
                                        </div>
                                    </Link>

                                </div>

                                <div className="border-t border-white/10 my-3"></div>

                                <div className="space-y-1">
                                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 text-primary hover:bg-white/10 transition-colors cursor-pointer">
                                            <LayoutDashboard className="h-5 w-5" />
                                            <span className="font-semibold text-base">Dashboard</span>
                                        </div>
                                    </Link>
                                    <Link href="/cart" onClick={() => setMobileMenuOpen(false)}>
                                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
                                            <Wallet className="h-5 w-5" /> {/* Using Wallet icon for Cart as placeholder, or ShoppingCart if imported */}
                                            <span className="font-semibold text-base">Cart</span>
                                        </div>
                                    </Link>
                                </div>

                                <div className="mt-4 pt-2">
                                    <button
                                        onClick={() => {
                                            handleLogout()
                                            setMobileMenuOpen(false)
                                        }}
                                        className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-destructive hover:bg-destructive/10 transition-colors font-semibold text-base"
                                    >
                                        <LogOut className="h-5 w-5" />
                                        <span>Sign Out</span>
                                    </button>
                                </div>
                            </nav>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className="flex-1 overflow-auto pb-20 lg:pb-0">
                {children}
            </main>
        </div>
    )
}
