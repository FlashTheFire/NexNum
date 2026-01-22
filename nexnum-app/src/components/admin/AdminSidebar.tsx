"use client"

import { Link, usePathname } from "@/i18n/navigation"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import {
    LayoutDashboard,
    Users,
    ShoppingBag,
    Settings,
    ArrowLeft,
    RefreshCw,
    CreditCard,
    Server,
    Activity,
    PanelLeftClose,
    PanelLeft
} from "lucide-react"
import { useSidebar } from "./SidebarContext"

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
    const { isCollapsed, toggleSidebar } = useSidebar()

    return (
        <div
            className={`fixed left-0 top-0 bottom-0 bg-[#0a0a0c]/80 backdrop-blur-xl border-r border-white/5 z-50 flex-col hidden md:flex transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'
                }`}
        >
            {/* Logo / Brand */}
            <div className="h-20 flex items-center justify-center px-4 border-b border-white/5">
                <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                    <img
                        src="/logos/nexnum-logo.svg"
                        alt="NexNum"
                        className="w-8 h-8 brightness-0 invert opacity-70"
                    />
                </div>
                {!isCollapsed && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="ml-3 font-bold text-white tracking-widest text-sm whitespace-nowrap"
                    >
                        NEXNUM <span className="text-[hsl(var(--neon-lime))]">ADMIN</span>
                    </motion.span>
                )}
            </div>

            {/* Menu */}
            <div className="flex-1 py-8 px-2 space-y-2 overflow-y-auto">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`relative flex items-center px-3 py-3 rounded-xl transition-all group ${isCollapsed ? 'justify-center' : 'justify-start'
                                }`}
                            title={isCollapsed ? t(item.label) : undefined}
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
                                className={`relative z-10 transition-colors flex-shrink-0 ${isActive ? 'text-[hsl(var(--neon-lime))]' : 'text-gray-400 group-hover:text-white'}`}
                            />

                            {!isCollapsed && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className={`ml-3 relative z-10 text-sm font-medium transition-colors whitespace-nowrap ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}
                                >
                                    {t(item.label)}
                                </motion.span>
                            )}
                        </Link>
                    )
                })}
            </div>

            {/* Collapse Toggle Button */}
            <div className="px-2 py-2 border-t border-white/5">
                <button
                    onClick={toggleSidebar}
                    className="w-full flex items-center justify-center h-10 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-all"
                    title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {isCollapsed ? (
                        <PanelLeft size={20} />
                    ) : (
                        <>
                            <PanelLeftClose size={20} />
                            <span className="ml-3 text-sm font-medium">Collapse</span>
                        </>
                    )}
                </button>
            </div>

            {/* Exit Admin */}
            <div className="p-4 border-t border-white/5">
                <Link
                    href="/dashboard"
                    className={`flex items-center px-3 py-3 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-colors ${isCollapsed ? 'justify-center' : 'justify-start'
                        }`}
                    title={isCollapsed ? t("exit") : undefined}
                >
                    <ArrowLeft size={20} className="flex-shrink-0" />
                    {!isCollapsed && (
                        <span className="ml-3 text-sm font-medium whitespace-nowrap">{t("exit")}</span>
                    )}
                </Link>
            </div>
        </div>
    )
}
