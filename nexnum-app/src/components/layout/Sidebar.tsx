
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils/utils"
import {
    LayoutDashboard,
    ShoppingCart,
    Smartphone,
    Wallet,
    Settings,
} from "lucide-react"
import { useGlobalStore } from "@/stores/appStore"
import { useCurrency } from "@/providers/CurrencyProvider"

const sidebarItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Buy Number", href: "/dashboard/buy", icon: ShoppingCart },
    { name: "My Numbers", href: "/dashboard/numbers", icon: Smartphone },
    { name: "Wallet", href: "/dashboard/wallet", icon: Wallet },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function Sidebar({ className }: { className?: string }) {
    const pathname = usePathname()
    const { userProfile } = useGlobalStore()
    const { formatBalance } = useCurrency()

    return (
        <div className={cn("pb-12 min-h-screen w-64 border-r bg-card/50 backdrop-blur-xl hidden md:block", className)}>
            <div className="space-y-4 py-4">
                <div className="px-4 py-2">
                    <Link href="/" className="flex items-center gap-2 mb-8 px-2">
                        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                            <span className="text-primary-foreground font-bold text-lg">N</span>
                        </div>
                        <h2 className="text-xl font-bold tracking-tight neon-text-glow text-white">NexNum</h2>
                    </Link>

                    <div className="space-y-1">
                        {sidebarItems.map((item) => {
                            const Icon = item.icon
                            const isActive = pathname === item.href

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
                                        isActive
                                            ? "bg-secondary text-primary font-medium shadow-[0_0_15px_rgba(188,255,0,0.1)] border-l-2 border-primary"
                                            : "text-muted-foreground hover:bg-secondary/50"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.name}
                                </Link>
                            )
                        })}
                    </div>
                </div>
            </div>

            <div className="absolute bottom-4 left-0 right-0 px-6">
                <div className="rounded-xl bg-gradient-to-br from-teal-deep to-teal-mid p-4 border border-teal-500/20">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-teal-200 uppercase font-bold">Balance</span>
                        <Wallet className="h-4 w-4 text-neon-lime" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {formatBalance(userProfile.balance || 0)}
                    </div>
                    <button className="mt-3 w-full text-xs bg-white/10 hover:bg-white/20 py-1.5 rounded text-white transition-colors">
                        Top Up
                    </button>
                </div>
            </div>
        </div>
    )
}
