"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    User,
    Shield,
    Bell,
    Mail,
    Smartphone,
    Globe,
    LogOut,
    Camera,
    Check,
    Lock,
    Save,
    Sparkles,
    Key,
    ShieldCheck
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuthStore } from "@/stores/authStore"
import { cn } from "@/lib/utils/utils"
import { NotificationSettings } from "@/components/dashboard/settings/NotificationSettings"
import { TwoFactorSetup } from "@/components/dashboard/settings/TwoFactorSetup"
import { useCurrency } from "@/providers/CurrencyProvider"
import { DarkNeobrutalistNotificationCard } from "@/components/dashboard/DarkNeobrutalistNotificationCard"

// Tab Configuration (Billing Removed)
const tabs = [
    { id: "general", label: "General", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "notifications", label: "Notifications", icon: Bell },
]

// Animation Variants
const fadeInScale = {
    initial: { opacity: 0, y: 10, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25 } },
    exit: { opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.15 } }
}

export default function SettingsPage() {
    const { user, updateUser, token } = useAuthStore()
    const { currencies, settings: currencySettings } = useCurrency()
    const [activeTab, setActiveTab] = useState("general")
    const [isLoading, setIsLoading] = useState(false)
    const [showDemoNotification, setShowDemoNotification] = useState(true)

    const [name, setName] = useState(user?.name || "")
    const [email, setEmail] = useState(user?.email || "")
    const [preferredCurrency, setPreferredCurrency] = useState(user?.preferredCurrency && user.preferredCurrency !== 'POINTS' ? user.preferredCurrency : "USD")
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean((user as any)?.twoFactorEnabled))

    const handleSave = async () => {
        setIsLoading(true)
        try {
            const res = await fetch('/api/auth/me', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, email, preferredCurrency })
            })

            const data = await res.json()
            if (res.ok) {
                updateUser(data.user)
                toast.success("Settings Updated Successfully")
            } else {
                toast.error(data.error || "Update failed")
            }
        } catch (e) {
            toast.error("Network error")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-full p-4 md:p-6 lg:p-8 relative overflow-hidden bg-[#0a0a0c]">
            {/* Background Ambience & Glow */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-[hsl(var(--neon-lime))/0.04] rounded-full blur-[140px]" />
                <div className="absolute bottom-10 left-10 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[140px]" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[hsl(var(--neon-lime))] text-black mb-2 shadow-[2px_2px_0px_0px_#000]">
                            <Sparkles className="h-3.5 w-3.5 fill-current" />
                            Account Preferences
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">
                            Settings
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">Manage profile parameters, security 2FA, and notification channels</p>
                    </div>

                    <motion.div whileTap={{ scale: 0.95 }}>
                        <Button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="bg-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime))/0.9] text-black font-extrabold text-sm h-11 px-6 rounded-xl border-2 border-black shadow-[4px_4px_0px_0px_#000] transition-all flex items-center gap-2"
                        >
                            <Save className="h-4 w-4" />
                            {isLoading ? "Saving..." : "Save Changes"}
                        </Button>
                    </motion.div>
                </div>

                {/* Tabs Navigation (Neo-Brutalist Design) */}
                <div className="flex p-1.5 bg-[#12141c] border-2 border-white/15 rounded-2xl w-full md:w-fit overflow-x-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)]">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "relative px-6 py-3 rounded-xl text-xs md:text-sm font-black transition-all duration-200 flex items-center gap-2.5 whitespace-nowrap uppercase tracking-wider",
                                    isActive
                                        ? "bg-[hsl(var(--neon-lime))] text-black shadow-[2px_2px_0px_0px_#000]"
                                        : "text-gray-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <tab.icon className="h-4 w-4 relative z-10 shrink-0" />
                                <span className="relative z-10">{tab.label}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Content Area */}
                <div className="relative min-h-[450px]">
                    <AnimatePresence mode="wait">
                        {/* ────── TAB 1: GENERAL ────── */}
                        {activeTab === "general" && (
                            <motion.div
                                key="general"
                                {...fadeInScale}
                                className="space-y-6"
                            >
                                {/* Profile Card */}
                                <Card className="border-2 border-white/15 bg-[#10121a]/80 backdrop-blur-xl rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,0.9)] overflow-hidden">
                                    <CardHeader className="border-b border-white/10 bg-white/[0.02]">
                                        <CardTitle className="text-xl font-black text-white flex items-center gap-2">
                                            <User className="h-5 w-5 text-[hsl(var(--neon-lime))]" />
                                            Profile Information
                                        </CardTitle>
                                        <CardDescription className="text-gray-400 text-xs">Update your account name and email address</CardDescription>
                                    </CardHeader>

                                    <CardContent className="p-6 space-y-6">
                                        {/* Avatar Section */}
                                        <div className="flex items-center gap-6 pb-6 border-b border-white/10">
                                            <div className="relative group cursor-pointer">
                                                <div className="w-20 h-20 rounded-2xl bg-[hsl(var(--neon-lime))] p-1 border-2 border-black shadow-[4px_4px_0px_0px_#000]">
                                                    <div className="w-full h-full rounded-xl bg-black/90 flex items-center justify-center border border-white/20">
                                                        <span className="text-2xl font-black text-[hsl(var(--neon-lime))]">{name ? name.charAt(0).toUpperCase() : "U"}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <h3 className="text-lg font-black text-white">{name || "User"}</h3>
                                                <p className="text-xs text-gray-400 font-mono mt-0.5">{email || "No email set"}</p>
                                                <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    <ShieldCheck className="h-3 w-3" />
                                                    Verified Account
                                                </div>
                                            </div>
                                        </div>

                                        {/* Form Fields Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-black uppercase tracking-wider text-gray-300">Full Display Name</Label>
                                                <Input
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    placeholder="Enter your full name"
                                                    className="h-11 bg-black/50 border-2 border-white/15 focus:border-[hsl(var(--neon-lime))] rounded-xl text-white font-medium shadow-[2px_2px_0px_0px_#000]"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-black uppercase tracking-wider text-gray-300">Email Address</Label>
                                                <Input
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder="name@example.com"
                                                    className="h-11 bg-black/50 border-2 border-white/15 focus:border-[hsl(var(--neon-lime))] rounded-xl text-white font-medium shadow-[2px_2px_0px_0px_#000]"
                                                />
                                            </div>

                                            <div className="space-y-2 md:col-span-2">
                                                <Label className="text-xs font-black uppercase tracking-wider text-gray-300">Preferred Display Currency</Label>
                                                <select
                                                    value={preferredCurrency}
                                                    onChange={(e) => setPreferredCurrency(e.target.value)}
                                                    className="w-full h-11 px-4 bg-black/50 border-2 border-white/15 focus:border-[hsl(var(--neon-lime))] rounded-xl text-white font-bold text-sm shadow-[2px_2px_0px_0px_#000] outline-none"
                                                >
                                                    {(Array.isArray(currencies) ? currencies : Object.values(currencies || {})).map((c: any) => (
                                                        <option key={c.code} value={c.code} className="bg-[#12141c] text-white">
                                                            {c.symbol} ({c.code}) - {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {/* ────── TAB 2: SECURITY ────── */}
                        {activeTab === "security" && (
                            <motion.div
                                key="security"
                                {...fadeInScale}
                                className="space-y-6"
                            >
                                <Card className="border-2 border-white/15 bg-[#10121a]/80 backdrop-blur-xl rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,0.9)] overflow-hidden">
                                    <CardHeader className="border-b border-white/10 bg-white/[0.02]">
                                        <CardTitle className="text-xl font-black text-white flex items-center gap-2">
                                            <Shield className="h-5 w-5 text-[hsl(var(--neon-lime))]" />
                                            Security & Two-Factor Auth
                                        </CardTitle>
                                        <CardDescription className="text-gray-400 text-xs">Protect your account with Two-Factor Authentication (2FA) and password security</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        <TwoFactorSetup
                                            enabled={twoFactorEnabled}
                                            onStatusChange={setTwoFactorEnabled}
                                        />
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {/* ────── TAB 3: NOTIFICATIONS ────── */}
                        {activeTab === "notifications" && (
                            <motion.div
                                key="notifications"
                                {...fadeInScale}
                                className="space-y-6"
                            >
                                <Card className="border-2 border-white/15 bg-[#10121a]/80 backdrop-blur-xl rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,0.9)] overflow-hidden">
                                    <CardHeader className="border-b border-white/10 bg-white/[0.02]">
                                        <CardTitle className="text-xl font-black text-white flex items-center gap-2">
                                            <Bell className="h-5 w-5 text-[hsl(var(--neon-lime))]" />
                                            Notification Preferences
                                        </CardTitle>
                                        <CardDescription className="text-gray-400 text-xs">Configure real-time SMS alerts, security notifications, and channel preferences</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        <NotificationSettings />
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Dark Neo-Brutalist Notification Card Toast */}
            {showDemoNotification && (
                <DarkNeobrutalistNotificationCard
                    title="Universal Schema Engine Active"
                    message="Multi-node RTDB fleet is running with 1,482 connected SIM nodes."
                    badgeText="FLEET ENGINE"
                    actionText="View Settings"
                    onClose={() => setShowDemoNotification(false)}
                />
            )}
        </div>
    )
}
