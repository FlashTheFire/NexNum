"use client"

import { Link, usePathname } from "@/i18n/navigation"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import {
    LayoutDashboard,
    Users,
    ShoppingBag,
    Settings,
    LogOut,
    ArrowLeft,
    RefreshCw,
    CreditCard,
    Server,
    Activity
} from "lucide-react"

const menuItems = [
    { icon: LayoutDashboard, label: "overview", href: "/admin" },
    { icon: Users, label: "users", href: "/admin/users" },
    { icon: Server, label: "providers", href: "/admin/providers" },
    { icon: ShoppingBag, label: "inventory", href: "/admin/inventory" },
    { icon: CreditCard, label: "transactions", href: "/admin/transactions" },
    { icon: RefreshCw, label: "currencies", href: "/admin/finance/currency" },
    { icon: Activity, label: "monitoring", href: "/admin/monitoring" },
    { icon: Settings, label: "settings", href: "/admin/settings" },
]

export const AdminSidebar = () => {
    const pathname = usePathname()
    const t = useTranslations("admin.nav")


    return (
        <div className="fixed left-0 top-0 bottom-0 w-20 md:w-64 bg-[#0a0a0c]/80 backdrop-blur-xl border-r border-white/5 z-50 flex flex-col hidden md:flex">
            {/* Logo / Brand */}
            <div className="h-20 flex items-center justify-center md:justify-start md:px-6 border-b border-white/5">
                <div className="w-10 h-10 flex items-center justify-center">
                    <img
                        src="/logos/nexnum-logo.svg"
                        alt="NexNum"
                        className="w-8 h-8 brightness-0 invert opacity-70"
                    />
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
                                {t(item.label)}
                            </span>
                        </Link>
                    )
                })}
            </div>

            <div className="p-4 border-t border-white/5">
                <Link href="/dashboard" className="flex items-center justify-center md:justify-start px-2 md:px-4 py-3 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                    <span className="hidden md:block ml-3 text-sm font-medium">{t("exit")}</span>
                </Link>
            </div>
        </div>
    )
}
