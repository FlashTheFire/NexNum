"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { BarChart3, Activity, Download, Settings } from "lucide-react"
import dynamic from "next/dynamic"

// Lazy load heavy components
const AnalyticsDashboard = dynamic(
    () => import("@/components/admin/AnalyticsDashboard"),
    {
        loading: () => <AnalyticsLoading />,
        ssr: false
    }
)

const ActivityTimeline = dynamic(
    () => import("@/components/admin/ActivityTimeline"),
    {
        loading: () => <TimelineLoading />,
        ssr: false
    }
)

function AnalyticsLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-32 bg-gray-800/50 rounded-xl" />
                ))}
            </div>
            <div className="h-80 bg-gray-800/50 rounded-xl" />
        </div>
    )
}

function TimelineLoading() {
    return (
        <div className="space-y-4 animate-pulse">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-800/50 rounded-lg" />
            ))}
        </div>
    )
}

type TabType = 'analytics' | 'activity'

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<TabType>('analytics')

    const tabs = [
        { id: 'analytics' as TabType, label: 'Analytics', icon: BarChart3 },
        { id: 'activity' as TabType, label: 'Activity', icon: Activity },
    ]

    return (
        <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
            {/* Premium Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                <div>
                    <motion.h1
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl font-bold text-white tracking-tight flex items-center gap-3"
                    >
                        <span className="w-2 h-8 bg-gradient-to-b from-violet-500 to-violet-700 rounded-full shadow-[0_0_15px_rgba(139,92,246,0.5)]" />
                        Command Center
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: 0.1 } }}
                        className="text-gray-400 mt-2 text-sm max-w-md"
                    >
                        Real-time analytics and system monitoring
                    </motion.p>
                </div>

                {/* Status + Actions */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3"
                >
                    <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        SYSTEM OPTIMAL
                    </span>
                    <button className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors">
                        <Download className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors">
                        <Settings className="w-4 h-4" />
                    </button>
                </motion.div>
            </div>

            {/* Tab Navigation */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 mb-6 p-1 bg-gray-900/50 rounded-xl w-fit border border-gray-800"
            >
                {tabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${isActive
                                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </motion.div>

            {/* Tab Content */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
            >
                {activeTab === 'analytics' && <AnalyticsDashboard />}
                {activeTab === 'activity' && <ActivityTimeline />}
            </motion.div>
        </main>
    )
}
