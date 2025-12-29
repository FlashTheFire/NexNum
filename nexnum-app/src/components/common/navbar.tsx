"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
    Menu,
    X,
    Phone,
    ShoppingCart,
    User,
    Wallet,
    LogOut,
    LayoutDashboard,
    Sparkles,
    Search
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { useGlobalStore } from "@/store"
import { formatPrice, cn } from "@/lib/utils"

const navLinks = [
    { href: "/", label: "Home" },
    { href: "/buy", label: "Smart Buy" },
    { href: "/#pricing", label: "Pricing" },
]

export function Navbar() {
    const pathname = usePathname()
    const { isAuthenticated, user, cart, logout } = useGlobalStore()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    const cartItemCount = cart.length

    return (
        <>
            <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40">
                <nav className="container mx-auto px-4">
                    <div className="flex h-16 items-center justify-between">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
                            <motion.div
                                whileHover={{ scale: 1.1, rotate: 10 }}
                                className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25"
                            >
                                <Phone className="h-4 w-4 text-white" />
                            </motion.div>
                            <span className="text-xl font-bold">
                                <span className="gradient-text">Nex</span>Num
                            </span>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden md:flex items-center gap-1">
                            {navLinks.map((link) => (
                                <Link key={link.href} href={link.href}>
                                    <Button
                                        variant="ghost"
                                        className={cn(
                                            "text-sm font-medium rounded-xl",
                                            pathname === link.href && "bg-muted/50"
                                        )}
                                    >
                                        {link.label}
                                    </Button>
                                </Link>
                            ))}
                        </div>

                        {/* Desktop Actions */}
                        <div className="hidden md:flex items-center gap-3">
                            <ThemeToggle />

                            {isAuthenticated ? (
                                <>
                                    {/* Wallet Pill */}
                                    <Link href="/dashboard/wallet">
                                        <div className="wallet-pill">
                                            <Wallet className="h-4 w-4" />
                                            <span>{formatPrice(user?.balance || 0)}</span>
                                        </div>
                                    </Link>

                                    {/* Cart */}
                                    <Link href="/buy">
                                        <Button variant="ghost" size="icon" className="relative rounded-xl">
                                            <ShoppingCart className="h-4 w-4" />
                                            {cartItemCount > 0 && (
                                                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 text-[10px] font-bold text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                                    {cartItemCount}
                                                </span>
                                            )}
                                        </Button>
                                    </Link>

                                    {/* Dashboard */}
                                    <Link href="/dashboard">
                                        <Button variant="gradient" size="sm" className="gap-2 rounded-xl">
                                            <LayoutDashboard className="h-4 w-4" />
                                            Dashboard
                                        </Button>
                                    </Link>
                                </>
                            ) : (
                                <>
                                    <Link href="/login">
                                        <Button variant="ghost" size="sm" className="rounded-xl">Sign In</Button>
                                    </Link>
                                    <Link href="/register">
                                        <Button variant="emerald" size="sm" className="gap-2 rounded-xl">
                                            <Sparkles className="h-4 w-4" />
                                            Get Started
                                        </Button>
                                    </Link>
                                </>
                            )}
                        </div>

                        {/* Mobile Actions */}
                        <div className="flex md:hidden items-center gap-2">
                            {isAuthenticated && (
                                <Link href="/dashboard">
                                    <motion.div whileTap={{ scale: 0.9 }}>
                                        <div className="relative group h-9 w-9 rounded-xl overflow-hidden p-[1px]">
                                            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 via-purple-500 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
                                            <div className="relative h-full w-full bg-background/90 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/5">
                                                <span className="font-bold text-sm bg-gradient-to-br from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                                                    {user?.name?.charAt(0).toUpperCase() || <User className="h-5 w-5 text-muted-foreground" />}
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                </Link>
                            )}

                            <ThemeToggle />

                            <motion.div whileTap={{ scale: 0.9 }}>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                    className="relative group h-9 w-9 rounded-xl overflow-hidden p-[1px]"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 via-white/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
                                    <div className="relative h-full w-full bg-background/90 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/5">
                                        <div className="flex flex-col gap-[5px] items-end w-5">
                                            <motion.span
                                                animate={mobileMenuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                                                className="w-full h-0.5 bg-foreground rounded-full origin-center"
                                            />
                                            <motion.span
                                                animate={mobileMenuOpen ? { opacity: 0, x: -10 } : { opacity: 1, x: 0 }}
                                                className="w-[70%] h-0.5 bg-foreground rounded-full"
                                            />
                                            <motion.span
                                                animate={mobileMenuOpen ? { rotate: -45, y: -7, width: "100%" } : { rotate: 0, y: 0, width: "50%" }}
                                                className="w-[50%] h-0.5 bg-foreground rounded-full origin-center"
                                            />
                                        </div>
                                    </div>
                                </Button>
                            </motion.div>
                        </div>
                    </div>
                </nav>
            </header>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 top-16 z-40 md:hidden"
                    >
                        <div
                            className="absolute inset-0 bg-background/95 backdrop-blur-xl"
                            onClick={() => setMobileMenuOpen(false)}
                        />
                        <nav className="relative glass-premium border-b shadow-xl m-4 rounded-2xl overflow-hidden">
                            <div className="p-4 space-y-1">
                                {navLinks.map((link, i) => (
                                    <motion.div
                                        key={link.href}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <Link
                                            href={link.href}
                                            onClick={() => setMobileMenuOpen(false)}
                                        >
                                            <Button
                                                variant={pathname === link.href ? "secondary" : "ghost"}
                                                className="w-full justify-start h-12 text-base rounded-xl"
                                            >
                                                {link.label}
                                            </Button>
                                        </Link>
                                    </motion.div>
                                ))}

                                <div className="border-t border-border/50 my-3" />

                                {isAuthenticated ? (
                                    <>
                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.15 }}
                                        >
                                            <Link
                                                href="/dashboard"
                                                onClick={() => setMobileMenuOpen(false)}
                                            >
                                                <Button variant="ghost" className="w-full justify-start h-12 text-base gap-3 rounded-xl">
                                                    <LayoutDashboard className="h-5 w-5" />
                                                    Dashboard
                                                </Button>
                                            </Link>
                                        </motion.div>

                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            <Link
                                                href="/buy"
                                                onClick={() => setMobileMenuOpen(false)}
                                            >
                                                <Button variant="ghost" className="w-full justify-start h-12 text-base gap-3 rounded-xl">
                                                    <ShoppingCart className="h-5 w-5" />
                                                    Cart
                                                    {cartItemCount > 0 && (
                                                        <Badge className="ml-auto bg-emerald-500">{cartItemCount}</Badge>
                                                    )}
                                                </Button>
                                            </Link>
                                        </motion.div>

                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.25 }}
                                        >
                                            <Button
                                                variant="ghost"
                                                className="w-full justify-start h-12 text-base gap-3 text-destructive hover:text-destructive rounded-xl"
                                                onClick={() => {
                                                    logout()
                                                    setMobileMenuOpen(false)
                                                }}
                                            >
                                                <LogOut className="h-5 w-5" />
                                                Sign Out
                                            </Button>
                                        </motion.div>
                                    </>
                                ) : (
                                    <>
                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.15 }}
                                        >
                                            <Link
                                                href="/login"
                                                onClick={() => setMobileMenuOpen(false)}
                                            >
                                                <Button variant="ghost" className="w-full justify-start h-12 text-base gap-3 rounded-xl">
                                                    <User className="h-5 w-5" />
                                                    Sign In
                                                </Button>
                                            </Link>
                                        </motion.div>

                                        <motion.div
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            <Link
                                                href="/register"
                                                onClick={() => setMobileMenuOpen(false)}
                                            >
                                                <Button variant="emerald" className="w-full h-12 text-base mt-2 rounded-xl">
                                                    <Sparkles className="h-5 w-5 mr-2" />
                                                    Get Started Free
                                                </Button>
                                            </Link>
                                        </motion.div>
                                    </>
                                )}
                            </div>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
