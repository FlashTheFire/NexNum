"use client"

import { DashboardStats } from "@/components/admin/DashboardStats"
import { motion } from "framer-motion"
import { Settings, Shield, Globe, ShoppingBag } from "lucide-react"

export default function AdminDashboard() {
    return (
        <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-end justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <span className="w-2 h-8 bg-[hsl(var(--neon-lime))] rounded-full shadow-[0_0_15px_hsl(var(--neon-lime))]" />
                        Command Center
                    </h1>
                    <p className="text-gray-400 mt-2 text-sm max-w-md">System Overview and Critical Operations</p>
                </div>

                <div className="hidden md:flex items-center gap-4">
                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono animate-pulse">
                        SYSTEM OPTIMAL
                    </span>
                </div>
            </div>

            {/* Stats Grid */}
            <DashboardStats />

            {/* Main Content Area - 3D/Iso Islands Placeholder */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Large Chart/Map Section */}
                <motion.div
                    className="lg:col-span-2 bg-[#111318]/40 border border-white/5 rounded-3xl p-6 min-h-[400px] relative overflow-hidden group"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.03),transparent_50%)]" />
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 relative z-10">
                        <Globe size={18} className="text-blue-400" />
                        Global Traffic
                    </h3>

                    {/* Placeholder for Map visualization */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-64 h-64 rounded-full border border-dashed border-white/10 animate-[spin_60s_linear_infinite]" />
                        <div className="absolute w-48 h-48 rounded-full border border-gray-800" />
                    </div>
                </motion.div>

                {/* Quick Actions / Side Panel */}
                <div className="space-y-6">
                    <motion.div
                        className="bg-[#111318]/40 border border-white/5 rounded-3xl p-6 relative overflow-hidden hover:border-[hsl(var(--neon-lime))/20] transition-colors"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Shield size={18} className="text-[hsl(var(--neon-lime))]" />
                            Security
                        </h3>
                        <div className="space-y-2">
                            <div className="h-10 w-full bg-white/5 rounded-lg" />
                            <div className="h-10 w-full bg-white/5 rounded-lg" />
                        </div>
                    </motion.div>

                    <motion.div
                        className="bg-[#111318]/40 border border-white/5 rounded-3xl p-6 relative overflow-hidden hover:border-purple-500/20 transition-colors"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <ShoppingBag size={18} className="text-purple-400" />
                            Inventory
                        </h3>
                        {/* 3D Box Placeholder */}
                        <div className="h-32 w-full bg-purple-500/5 rounded-xl border border-dashed border-purple-500/20 flex items-center justify-center">
                            <span className="text-xs text-purple-400">Inventory Status</span>
                        </div>
                    </motion.div>
                </div>

            </div>
        </main>
    )
}
