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
    Eye,
    EyeOff,
    CreditCard
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useGlobalStore } from "@/stores/appStore"
import { useAuthStore } from "@/stores/authStore"
import { cn } from "@/lib/utils/utils"
import { NotificationSettings } from "@/components/dashboard/settings/NotificationSettings"
import { TwoFactorSetup } from "@/components/dashboard/settings/TwoFactorSetup"
import { useCurrency } from "@/providers/CurrencyProvider"

// Tab Configuration
const tabs = [
    { id: "general", label: "General", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "billing", label: "Billing", icon: CreditCard },
]

// Animation Variants
const fadeInScale = {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
}

export default function SettingsPage() {
    const { user, updateUser, token } = useAuthStore()
    const { currencies, settings: currencySettings } = useCurrency()
    const [activeTab, setActiveTab] = useState("general")
    const [isLoading, setIsLoading] = useState(false)

    // Form States
    const [name, setName] = useState(user?.name || "")
    const [email, setEmail] = useState(user?.email || "")
    const [preferredCurrency, setPreferredCurrency] = useState(user?.preferredCurrency || "USD")
    const [twoFactor, setTwoFactor] = useState(false)

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
        <div className="min-h-full p-4 md:p-6 lg:p-8 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        Settings
                    </h1>
                    <p className="text-muted-foreground mt-1">Manage your account preferences</p>
                </div>

                {/* Tabs Navigation */}
                <div className="flex p-1 bg-card/30 backdrop-blur-xl border border-white/5 rounded-2xl w-full md:w-fit overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "relative px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 whitespace-nowrap",
                                activeTab === tab.id ? "text-white" : "text-muted-foreground hover:text-white"
                            )}
                        >
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 bg-white/10 rounded-xl"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <tab.icon className="h-4 w-4 relative z-10" />
                            <span className="relative z-10">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="relative min-h-[500px]">
                    <AnimatePresence mode="wait">
                        {activeTab === "general" && (
                            <motion.div
                                key="general"
                                {...fadeInScale}
                                className="space-y-6"
                            >
                                {/* Profile Card */}
                                <Card className="border-white/10 bg-card/30 backdrop-blur-xl">
                                    <CardHeader>
                                        <CardTitle>Profile Information</CardTitle>
                                        <CardDescription>Update your public profile details</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-8">
                                        {/* Avatar Section */}
                                        <div className="flex items-center gap-6">
                                            <div className="relative group cursor-pointer">
                                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 p-0.5">
                                                    <div className="w-full h-full rounded-full bg-black/50 overflow-hidden flex items-center justify-center border-4 border-transparent">
                                                        <span className="text-3xl font-bold text-white">{name.charAt(0)}</span>
                                                    </div>
                                                </div>
                                                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Camera className="h-6 w-6 text-white" />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <Button variant="outline" size="sm" className="border-white/10">Change Avatar</Button>
                                                <p className="text-xs text-muted-foreground">JPG, GIF or PNG. 1MB max.</p>
                                            </div>
                                        </div>

                                        {/* Form Fields */}
                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label>Display Name</Label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                    <Input
                                                        value={name}
                                                        onChange={(e) => setName(e.target.value)}
                                                        className="pl-9 bg-black/20 border-white/10 focus:border-indigo-500/50"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Email Address</Label>
                                                <div className="relative">
                                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                    <Input
                                                        value={email}
                                                        onChange={(e) => setEmail(e.target.value)}
                                                        className="pl-9 bg-black/20 border-white/10 focus:border-indigo-500/50"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Regional Settings */}
                                <Card className="border-white/10 bg-card/30 backdrop-blur-xl">
                                    <CardHeader>
                                        <CardTitle>Preferences</CardTitle>
                                        <CardDescription>Customize your regional experience</CardDescription>
                                    </CardHeader>
                                    <CardContent className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label>Language</Label>
                                            <div className="relative">
                                                <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                <select className="w-full h-10 pl-9 pr-3 rounded-md border border-white/10 bg-black/20 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50">
                                                    <option>English (US)</option>
                                                    <option>Spanish</option>
                                                    <option>French</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Currency</Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-sm font-bold text-muted-foreground">
                                                    {currencies[preferredCurrency]?.symbol || (preferredCurrency === 'POINTS' ? 'P' : '$')}
                                                </span>
                                                <select
                                                    value={preferredCurrency}
                                                    onChange={(e) => setPreferredCurrency(e.target.value)}
                                                    className="w-full h-10 pl-9 pr-3 rounded-md border border-white/10 bg-black/20 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                                >
                                                    {Object.values(currencies).map(curr => (
                                                        <option key={curr.code} value={curr.code}>
                                                            {curr.name} ({curr.symbol})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {activeTab === "security" && (
                            <motion.div
                                key="security"
                                {...fadeInScale}
                                className="space-y-6"
                            >
                                {/* Password Change */}
                                <Card className="border-white/10 bg-card/30 backdrop-blur-xl">
                                    <CardHeader>
                                        <CardTitle>Password & Authentication</CardTitle>
                                        <CardDescription>Manage how you sign in to your account</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>Current Password</Label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                <Input type="password" placeholder="••••••••" className="pl-9 bg-black/20 border-white/10" />
                                            </div>
                                        </div>
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>New Password</Label>
                                                <div className="relative">
                                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                    <Input type="password" placeholder="Min. 8 characters" className="pl-9 bg-black/20 border-white/10" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Confirm Password</Label>
                                                <div className="relative">
                                                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                    <Input type="password" placeholder="Repeat password" className="pl-9 bg-black/20 border-white/10" />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* 2FA Toggle */}
                                <Card className="border-white/10 bg-card/30 backdrop-blur-xl">
                                    <TwoFactorSetup
                                        enabled={twoFactor}
                                        onStatusChange={setTwoFactor}
                                    />
                                </Card>
                            </motion.div>
                        )}

                        {activeTab === "notifications" && (
                            <motion.div
                                key="notifications"
                                {...fadeInScale}
                                className="space-y-6"
                            >
                                <NotificationSettings />
                            </motion.div>
                        )}

                        {activeTab === "billing" && (
                            <motion.div
                                key="billing"
                                {...fadeInScale}
                                className="space-y-6"
                            >
                                <Card className="border-white/10 bg-card/30 backdrop-blur-xl">
                                    <CardHeader>
                                        <CardTitle>Plan & Billing</CardTitle>
                                        <CardDescription>Manage your subscription and payment methods</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-indigo-300 mb-1">CURRENT PLAN</p>
                                                <h3 className="text-2xl font-bold text-white">Pro Member</h3>
                                                <p className="text-xs text-muted-foreground mt-1">Renews on Jan 14, 2026</p>
                                            </div>
                                            <Button className="bg-white text-black hover:bg-gray-200">Manage Plan</Button>
                                        </div>

                                        <div className="space-y-3">
                                            <Label>Payment Methods</Label>
                                            <div className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-black/20">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-6 bg-white/10 rounded flex items-center justify-center text-[10px] font-bold">VISA</div>
                                                    <div>
                                                        <p className="text-sm font-medium">Visa ending in 4242</p>
                                                        <p className="text-xs text-muted-foreground">Expiry 12/28</p>
                                                    </div>
                                                </div>
                                                <Button variant="ghost" size="sm">Edit</Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Fixed Save Button / Actions */}
                    <div className="flex justify-end pt-6">
                        <Button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="bg-indigo-600 hover:bg-indigo-500 min-w-[120px]"
                        >
                            {isLoading ? (
                                <>Saving...</>
                            ) : (
                                <>Save Changes</>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
