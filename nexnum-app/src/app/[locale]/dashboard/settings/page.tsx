"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    User,
    Shield,
    Bell,
    Key,
    BookOpen,
    Cpu,
    Settings,
    CheckCircle2,
    Sparkles
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/utils"

import { GeneralSettings } from "@/components/dashboard/settings/GeneralSettings"
import { SecuritySettings } from "@/components/dashboard/settings/SecuritySettings"
import { NotificationSettings } from "@/components/dashboard/settings/NotificationSettings"
import { ApiKeys } from "@/components/dashboard/settings/ApiKeys"
import { Webhooks } from "@/components/dashboard/settings/Webhooks"
import { DeveloperDocs } from "@/components/dashboard/settings/DeveloperDocs"
import { SystemPreferences } from "@/components/dashboard/settings/SystemPreferences"

// Enterprise Settings Tab Configuration
const tabs = [
    { id: "general", label: "General", icon: User, description: "Profile, language & currency" },
    { id: "security", label: "Security & Sessions", icon: Shield, description: "2FA, password & active devices" },
    { id: "notifications", label: "Notifications", icon: Bell, description: "Channel toggles & event table map" },
    { id: "api", label: "API Keys & Webhooks", icon: Key, description: "REST tokens & endpoint callbacks" },
    { id: "docs", label: "Developer Docs", icon: BookOpen, description: "API reference & code snippets" },
    { id: "system", label: "System Preferences", icon: Cpu, description: "Fleet sync, data export & danger zone" }
]

// Tab animation variants
const tabContentVariants = {
    initial: { opacity: 0, y: 8, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, y: -8, scale: 0.99, transition: { duration: 0.15 } }
}

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState("general")

    return (
        <div className="min-h-full p-4 md:p-6 lg:p-8 relative overflow-hidden bg-[#09090b]">
            {/* Background Ambience & Glow */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-10 right-1/4 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[140px]" />
                <div className="absolute bottom-10 left-10 w-[450px] h-[450px] bg-purple-600/5 rounded-full blur-[140px]" />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto space-y-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
                                <Settings className="w-6 h-6 text-indigo-400" />
                                System Settings
                            </h1>
                            <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-500/10 text-[10px] h-5 px-2">
                                ENTERPRISE
                            </Badge>
                        </div>
                        <p className="text-gray-400 text-xs">
                            Manage profile preferences, security authentication, notification event maps, API keys, and system diagnostics.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs px-2.5 py-1 flex items-center gap-1.5 font-mono">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Fleet Synced (0ms)
                        </Badge>
                    </div>
                </div>

                {/* Sub-Pages Horizontal Navigation Tabs */}
                <div className="flex items-center gap-1.5 p-1.5 bg-[#12131a]/90 border border-white/10 rounded-xl overflow-x-auto shadow-lg backdrop-blur-md">
                    {tabs.map((tab) => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer border",
                                    isActive
                                        ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20 font-semibold"
                                        : "text-gray-400 hover:text-white hover:bg-white/5 border-transparent"
                                )}
                            >
                                <Icon className={cn("w-3.5 h-3.5", isActive ? "text-white" : "text-gray-400")} />
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
                        {activeTab === "docs" && <DeveloperDocs />}
                        {activeTab === "system" && <SystemPreferences />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
