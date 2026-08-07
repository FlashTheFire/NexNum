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
            {/* Header & Overview Card */}
            <Card className="border-2 border-zinc-800 bg-[#0c0d12] shadow-[4px_4px_0px_0px_#a3e635]">
                <CardHeader className="pb-4 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <User className="w-5 h-5 text-lime-400" />
                            <CardTitle className="text-base font-extrabold text-white uppercase tracking-wider">Account & Profile Preferences</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-zinc-400 mt-1">
                            Update your public display name, email, preferred currency, and timezone.
                        </CardDescription>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="bg-lime-400 hover:bg-lime-500 text-black font-extrabold text-xs h-9 px-5 border-2 border-black shadow-[2px_2px_0px_0px_#000] transition-all cursor-pointer shrink-0"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                        Save Changes
                    </Button>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                    {/* User Card Showcase */}
                    <div className="p-4 rounded-xl bg-black border-2 border-zinc-800 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-lime-400 text-black font-extrabold text-lg flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_#000] shrink-0">
                                {name ? name.slice(0, 2).toUpperCase() : "NX"}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-extrabold text-white">{name || "NexNum User"}</h3>
                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] h-5 px-2 font-mono">
                                        <ShieldCheck className="w-3 h-3 mr-1" /> VERIFIED ACCOUNT
                                    </Badge>
                                </div>
                                <p className="text-xs text-zinc-400 font-mono mt-0.5">{email || "user@nexnum.app"}</p>
                            </div>
                        </div>
                    </div>

                    {/* Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Full Display Name</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="bg-black border-2 border-zinc-800 text-xs text-white h-10 focus:border-lime-400"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Email Address</Label>
                            <Input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="bg-black border-2 border-zinc-800 text-xs text-white h-10 focus:border-lime-400"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Preferred Display Currency</Label>
                            <select
                                value={selectedCurrency}
                                onChange={(e) => setSelectedCurrency(e.target.value)}
                                className="w-full h-10 px-3 rounded-md bg-black border-2 border-zinc-800 text-xs text-white focus:border-lime-400"
                            >
                                <option value="USD">$ (USD) - US Dollar</option>
                                <option value="INR">₹ (INR) - Indian Rupee</option>
                                <option value="EUR">€ (EUR) - Euro</option>
                                <option value="GBP">£ (GBP) - British Pound</option>
                                <option value="RUB">₽ (RUB) - Russian Ruble</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">System Locale & Timezone</Label>
                            <Input
                                value={timezone}
                                onChange={(e) => setTimezone(e.target.value)}
                                className="bg-black border-2 border-zinc-800 text-xs text-white h-10 focus:border-lime-400"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
