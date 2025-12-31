"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import {
    LayoutDashboard,
    Users,
    ShoppingBag,
    Settings,
    LogOut,
    ArrowLeft,
    RefreshCw,
    CreditCard
} from "lucide-react"

const menuItems = [
    { icon: LayoutDashboard, label: "Overview", href: "/admin" },
    { icon: Users, label: "Users", href: "/admin/users" },
    { icon: ShoppingBag, label: "Inventory", href: "/admin/inventory" },
    { icon: RefreshCw, label: "Provider Sync", href: "/admin/sync" },
    { icon: CreditCard, label: "Transactions", href: "/admin/transactions" },
    { icon: Settings, label: "Settings", href: "/admin/settings" },
]

export const AdminSidebar = () => {
    const pathname = usePathname()

    return (
        <div className="fixed left-0 top-0 bottom-0 w-20 md:w-64 bg-[#0a0a0c]/80 backdrop-blur-xl border-r border-white/5 z-50 flex flex-col hidden md:flex">
            {/* Logo / Brand */}
            <div className="h-20 flex items-center justify-center md:justify-start md:px-8 border-b border-white/5">
                <div className="w-8 h-8 bg-[hsl(var(--neon-lime))] rounded-lg flex items-center justify-center shadow-[0_0_15px_hsl(var(--neon-lime)/0.4)]">
                    <span className="font-bold text-black">N</span>
                </div>
                <span className="hidden md:block ml-3 font-bold text-white tracking-widest text-sm">NEXNUM <span className="text-[hsl(var(--neon-lime))]">ADMIN</span></span>
            </div>

            {/* Menu */}
            <div className="flex-1 py-8 px-2 md:px-4 space-y-2">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="relative flex items-center justify-center md:justify-start px-2 md:px-4 py-3 rounded-xl transition-all group"
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 bg-white/5 border border-white/10 rounded-xl"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}

                            <item.icon
                                size={20}
                                className={`relative z-10 transition-colors ${isActive ? 'text-[hsl(var(--neon-lime))]' : 'text-gray-400 group-hover:text-white'}`}
                            />

                            <span className={`hidden md:block ml-3 relative z-10 text-sm font-medium transition-colors ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>
                                {item.label}
                            </span>
                        </Link>
                    )
                })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5">
                <Link href="/dashboard" className="flex items-center justify-center md:justify-start px-2 md:px-4 py-3 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                    <span className="hidden md:block ml-3 text-sm font-medium">Exit to App</span>
                </Link>
            </div>
        </div>
    )
}
