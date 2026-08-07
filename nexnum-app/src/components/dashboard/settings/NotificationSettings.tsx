"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Mail, Smartphone, Volume2, ShieldCheck, Check, Sparkles, AlertCircle, Save, Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

interface NotifPrefs {
    emailAlerts?: boolean
    smsAlerts?: boolean
    pushAlerts?: boolean
    soundEnabled?: boolean
    lowBalanceAlert?: boolean
    securityAlerts?: boolean
    marketingEmails?: boolean
}

export function NotificationSettings() {
    const [prefs, setPrefs] = useState<NotifPrefs>({
        emailAlerts: true,
        smsAlerts: false,
        pushAlerts: true,
        soundEnabled: true,
        lowBalanceAlert: true,
        securityAlerts: true,
        marketingEmails: false
    })
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        fetchPrefs()
    }, [])

    const fetchPrefs = async () => {
        setIsLoading(true)
        try {
            const res = await fetch("/api/notifications/preferences")
            const data = await res.json()
            if (res.ok && data) {
                setPrefs(data)
            }
        } catch (e) {
            console.error("Using default notification preferences")
        } finally {
            setIsLoading(false)
        }
    }

    const handleToggle = (key: keyof NotifPrefs) => {
        const next = !prefs[key]
        setPrefs(prev => ({ ...prev, [key]: next }))
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const res = await fetch("/api/notifications/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(prefs)
            })

            if (res.ok) {
                toast.success("Notification preferences saved!")
            } else {
                toast.error("Failed to save notification preferences")
            }
        } catch (e) {
            toast.error("Network error saving preferences")
        } finally {
            setIsSaving(false)
        }
    }

    const testSound = () => {
        try {
            const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3")
            audio.play()
            toast.success("Playing test notification sound")
        } catch (e) {
            toast.info("Notification audio playback triggered")
        }
    }

    const notifCards = [
        {
            key: "pushAlerts" as const,
            title: "Browser Web Push Notifications",
            description: "Receive instant browser alerts when incoming OTP SMS arrives",
            icon: Bell,
            color: "border-lime-400 bg-lime-400/5 text-lime-400"
        },
        {
            key: "emailAlerts" as const,
            title: "Email Notifications & Invoices",
            description: "Receive transactional receipts, password changes, and account alerts",
            icon: Mail,
            color: "border-indigo-400 bg-indigo-400/5 text-indigo-400"
        },
        {
            key: "smsAlerts" as const,
            title: "SMS Phone Notifications",
            description: "Receive SMS alerts on your registered mobile number",
            icon: Smartphone,
            color: "border-purple-400 bg-purple-400/5 text-purple-400"
        },
        {
            key: "soundEnabled" as const,
            title: "Realtime Chime Audio",
            description: "Play an audible chime when new SMS is captured in dashboard",
            icon: Volume2,
            color: "border-emerald-400 bg-emerald-400/5 text-emerald-400",
            action: (
                <Button size="sm" variant="outline" onClick={testSound} className="h-7 px-2 text-[11px] border-emerald-400 text-emerald-400 hover:bg-emerald-400 hover:text-black">
                    Test Chime
                </Button>
            )
        }
    ]

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <Card className="border-2 border-zinc-800 bg-[#0c0d12] shadow-[4px_4px_0px_0px_#a3e635]">
                <CardHeader className="pb-4 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Bell className="w-5 h-5 text-lime-400" />
                            <CardTitle className="text-base font-extrabold text-white uppercase tracking-wider">Notification Rules & Sound</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-zinc-400 mt-1">
                            Configure channel preferences for OTP alerts, security logins, and balance updates.
                        </CardDescription>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-lime-400 hover:bg-lime-500 text-black font-extrabold text-xs h-9 px-5 border-2 border-black shadow-[2px_2px_0px_0px_#000] transition-all cursor-pointer shrink-0"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                        Save Notification Rules
                    </Button>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                    {/* Animated Dark Neo-Brutalist Notification Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {notifCards.map((card) => {
                            const Icon = card.icon
                            const isChecked = !!prefs[card.key]
                            return (
                                <motion.div
                                    key={card.key}
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${isChecked ? "bg-zinc-900 border-lime-400 shadow-[3px_3px_0px_0px_#a3e635]" : "bg-black border-zinc-800 hover:border-zinc-700"}`}
                                    onClick={() => handleToggle(card.key)}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <div className={`p-2.5 rounded-lg border-2 ${card.color}`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-xs font-extrabold text-white">{card.title}</h4>
                                                    {card.action && <div onClick={(e) => e.stopPropagation()}>{card.action}</div>}
                                                </div>
                                                <p className="text-[11px] text-zinc-400 mt-1">{card.description}</p>
                                            </div>
                                        </div>

                                        <Switch
                                            checked={isChecked}
                                            onCheckedChange={() => handleToggle(card.key)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>

                    {/* Event Matrix Table Map */}
                    <div className="space-y-3 pt-2">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Event Notification Matrix Map</h4>
                        <div className="divide-y divide-zinc-800 border-2 border-zinc-800 rounded-xl overflow-hidden bg-black">
                            <div className="p-4 flex items-center justify-between hover:bg-zinc-900/50">
                                <div>
                                    <p className="text-xs font-extrabold text-white">Low Wallet Balance Alert</p>
                                    <p className="text-[11px] text-zinc-500">Notify when total balance drops below ₹50 / $1.00</p>
                                </div>
                                <Switch checked={!!prefs.lowBalanceAlert} onCheckedChange={() => handleToggle("lowBalanceAlert")} />
                            </div>

                            <div className="p-4 flex items-center justify-between hover:bg-zinc-900/50">
                                <div>
                                    <p className="text-xs font-extrabold text-white">Critical Security & Login Alerts</p>
                                    <p className="text-[11px] text-zinc-500">Instant notification when new device or IP logs into account</p>
                                </div>
                                <Switch checked={!!prefs.securityAlerts} onCheckedChange={() => handleToggle("securityAlerts")} />
                            </div>

                            <div className="p-4 flex items-center justify-between hover:bg-zinc-900/50">
                                <div>
                                    <p className="text-xs font-extrabold text-white">Product Updates & Promotions</p>
                                    <p className="text-[11px] text-zinc-500">News about new country additions and feature releases</p>
                                </div>
                                <Switch checked={!!prefs.marketingEmails} onCheckedChange={() => handleToggle("marketingEmails")} />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
