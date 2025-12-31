"use client"

import { motion } from "framer-motion"
import { Users, CreditCard, Activity, Server } from "lucide-react"
import { PremiumSkeleton } from "@/components/ui/skeleton"

// Mock data (replace with SWR/API later)
const stats = [
    { label: "Total Users", value: "1,248", change: "+12%", icon: Users, color: "text-blue-400" },
    { label: "Revenue", value: "$4,320", change: "+8.1%", icon: CreditCard, color: "text-[hsl(var(--neon-lime))]" },
    { label: "Active Numbers", value: "854", change: "+24%", icon: Activity, color: "text-purple-400" },
    { label: "Provider Status", value: "Optimal", change: "100%", icon: Server, color: "text-emerald-400" },
]

export const DashboardStats = ({ isLoading }: { isLoading?: boolean }) => {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <PremiumSkeleton key={i} className="h-28 w-full" />)}
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
                <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    whileHover={{ scale: 1.02, rotateX: 2, z: 10 }}
                    className="relative group bg-[#111318]/60 backdrop-blur-md border border-white/5 rounded-2xl p-4 lg:p-6 overflow-hidden transition-all hover:border-[hsl(var(--neon-lime))/30] hover:shadow-[0_0_20px_rgba(204,255,0,0.05)] cursor-pointer"
                    style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className={`p-2 rounded-lg bg-white/5 ${stat.color} group-hover:scale-110 transition-transform`}>
                            <stat.icon size={20} />
                        </div>
                        <span className="text-xs font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{stat.change}</span>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-white mb-1 group-hover:text-[hsl(var(--neon-lime))] transition-colors">{stat.value}</div>
                        <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">{stat.label}</div>
                    </div>

                    {/* Background Glow */}
                    <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity ${stat.color.replace('text', 'bg')}`} />
                </motion.div>
            ))}
        </div>
    )
}
