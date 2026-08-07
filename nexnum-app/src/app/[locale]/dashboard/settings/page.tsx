"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    User,
    Shield,
    Bell,
    Key,
    Cpu,
    Settings,
    CheckCircle2,
    Sparkles,
    SlidersHorizontal
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/utils"

import { GeneralSettings } from "@/components/dashboard/settings/GeneralSettings"
import { SecuritySettings } from "@/components/dashboard/settings/SecuritySettings"
import { NotificationSettings } from "@/components/dashboard/settings/NotificationSettings"
import { ApiKeys } from "@/components/dashboard/settings/ApiKeys"
import { Webhooks } from "@/components/dashboard/settings/Webhooks"
import { SystemPreferences } from "@/components/dashboard/settings/SystemPreferences"

// Dark Neo-Brutalist Enterprise Settings Configuration
const tabs = [
    { id: "general", label: "General", icon: User, description: "Profile, language & currency" },
    { id: "security", label: "Security & Sessions", icon: Shield, description: "2FA, password & active devices" },
    { id: "notifications", label: "Notifications", icon: Bell, description: "Animated channel toggles & matrix map" },
    { id: "api", label: "API Keys & Webhooks", icon: Key, description: "REST tokens, webhooks & docs" },
    { id: "system", label: "System Preferences", icon: Cpu, description: "Fleet sync, data export & danger zone" }
]

const tabContentVariants = {
    initial: { opacity: 0, y: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, type: "spring", stiffness: 300, damping: 25 } },
    exit: { opacity: 0, y: -12, scale: 0.98, transition: { duration: 0.15 } }
}

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState("general")

    return (
        <div className="min-h-full p-4 md:p-6 lg:p-8 relative overflow-hidden bg-[#09090b]">
            {/* Ambient Glow Effects */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-12 right-1/4 w-[450px] h-[450px] bg-lime-500/5 rounded-full blur-[140px]" />
                <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[140px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto space-y-6">
                {/* Dark Neo-Brutalist Header Card */}
                <div className="p-6 rounded-2xl bg-[#0c0d12] border-2 border-zinc-800 shadow-[4px_4px_0px_0px_#a3e635] flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-lime-400 text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
                                    <Settings className="w-5 h-5" />
                                </div>
                                System Settings
                            </h1>
                            <Badge className="bg-lime-400 text-black font-extrabold text-[10px] border-2 border-black shadow-[2px_2px_0px_0px_#000] px-2.5 py-0.5">
                                ENTERPRISE
                            </Badge>
                        </div>
                        <p className="text-zinc-400 text-xs mt-1">
                            Manage your profile preferences, authentication sessions, realtime notification rules, and API token integrations.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <div className="px-3 py-1.5 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs font-mono font-bold flex items-center gap-2 shadow-[2px_2px_0px_0px_#10b981]">
                            <CheckCircle2 className="w-4 h-4" /> Fleet Synced (0ms)
                        </div>
                    </div>
                </div>

                {/* Sub-Pages Horizontal Neo-Brutalist Navigation Tabs */}
                <div className="flex items-center gap-2 p-2 bg-[#0c0d12] border-2 border-zinc-800 rounded-2xl overflow-x-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)]">
                    {tabs.map((tab) => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all shrink-0 cursor-pointer border-2",
                                    isActive
                                        ? "bg-lime-400 text-black border-black shadow-[3px_3px_0px_0px_#000] scale-[1.02]"
                                        : "text-zinc-400 hover:text-white hover:bg-zinc-900 border-transparent"
                                )}
                            >
                                <Icon className={cn("w-4 h-4", isActive ? "text-black" : "text-zinc-400")} />
                                <span>{tab.label}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Tab Content Display */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        variants={tabContentVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                    >
                        {activeTab === "general" && <GeneralSettings />}
                        {activeTab === "security" && <SecuritySettings />}
                        {activeTab === "notifications" && <NotificationSettings />}
                        {activeTab === "api" && (
                            <div className="space-y-6">
                                <ApiKeys />
                                <Webhooks />
                            </div>
                        )}
                        {activeTab === "system" && <SystemPreferences />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
