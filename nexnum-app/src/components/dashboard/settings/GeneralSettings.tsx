"use client"

import { useState } from "react"
import { User, Mail, Globe, Clock, ShieldCheck, Save, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/authStore"
import { useCurrency } from "@/providers/CurrencyProvider"

export function GeneralSettings() {
    const { user, updateUser, token } = useAuthStore()
    const { currencies, preferredCurrency } = useCurrency()

    const [name, setName] = useState(user?.name || "")
    const [email, setEmail] = useState(user?.email || "")
    const [selectedCurrency, setSelectedCurrency] = useState(
        user?.preferredCurrency && user.preferredCurrency !== 'POINTS' ? user.preferredCurrency : (preferredCurrency || "USD")
    )
    const [timezone, setTimezone] = useState("UTC+05:30 (Asia/Kolkata)")
    const [locale, setLocale] = useState("en-US")
    const [isLoading, setIsLoading] = useState(false)

    const handleSave = async () => {
        setIsLoading(true)
        try {
            const res = await fetch('/api/auth/me', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    email,
                    preferredCurrency: selectedCurrency
                })
            })

            const data = await res.json()
            if (res.ok) {
                updateUser(data.user)
                toast.success("Profile preferences saved successfully")
            } else {
                toast.error(data.error || "Failed to update profile")
            }
        } catch (e) {
            toast.error("Network error saving profile settings")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Account Overview Header Card */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xl shrink-0 shadow-inner">
                            {name ? name.slice(0, 2).toUpperCase() : "NX"}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-semibold text-white">{name || "NexNum User"}</h3>
                                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px] h-5 px-2">
                                    <ShieldCheck className="w-3 h-3 mr-1" /> VERIFIED
                                </Badge>
                                <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-500/10 text-[10px] h-5 px-2">
                                    <Sparkles className="w-3 h-3 mr-1" /> PRO TIER
                                </Badge>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 font-mono">{email || "user@nexnum.app"}</p>
                        </div>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={isLoading}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow-md transition-all shrink-0"
                    >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                        Save Changes
                    </Button>
                </CardContent>
            </Card>

            {/* Profile Preferences */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-indigo-400" />
                        <CardTitle className="text-sm font-semibold text-white">Profile Information</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-gray-400">
                        Update your public display name and account email address.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5 grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-300">Display Name</Label>
                        <div className="relative">
                            <User className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter full name"
                                className="bg-black/30 border-white/10 pl-9 text-xs h-10 focus:border-indigo-500/50"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-300">Email Address</Label>
                        <div className="relative">
                            <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                            <Input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                className="bg-black/30 border-white/10 pl-9 text-xs h-10 focus:border-indigo-500/50"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Regional & Financial Preferences */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-indigo-400" />
                        <CardTitle className="text-sm font-semibold text-white">Regional & Currency Preferences</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-gray-400">
                        Configure display currency formatting, system locale, and timezone.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5 grid md:grid-cols-3 gap-5">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-300">Display Currency</Label>
                        <select
                            value={selectedCurrency}
                            onChange={(e) => setSelectedCurrency(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 text-xs text-white h-10 focus:outline-none focus:border-indigo-500/50"
                        >
                            {Object.values(currencies || {}).map((curr) => (
                                <option key={curr.code} value={curr.code} className="bg-[#12131a] text-white">
                                    {curr.symbol} ({curr.code}) - {curr.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-300">System Locale</Label>
                        <select
                            value={locale}
                            onChange={(e) => setLocale(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 text-xs text-white h-10 focus:outline-none focus:border-indigo-500/50"
                        >
                            <option value="en-US" className="bg-[#12131a]">English (United States)</option>
                            <option value="en-GB" className="bg-[#12131a]">English (United Kingdom)</option>
                            <option value="hi-IN" className="bg-[#12131a]">Hindi (India)</option>
                            <option value="es-ES" className="bg-[#12131a]">Spanish (Spain)</option>
                            <option value="ru-RU" className="bg-[#12131a]">Russian (Russia)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-300">Timezone</Label>
                        <div className="relative">
                            <Clock className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                            <Input
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                className="bg-black/30 border-white/10 pl-9 text-xs h-10 focus:border-indigo-500/50"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
