"use client"

import { useState, useEffect } from "react"
import { Switch } from "@/components/ui/switch"
import { Bell, Volume2, Shield, CreditCard, MessageSquare, Zap, Check, Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface EventCategory {
    id: string
    category: string
    description: string
    pushEnabled: boolean
    emailEnabled: boolean
    smsEnabled: boolean
}

export function NotificationSettings() {
    // Master channel toggles
    const [pushEnabled, setPushEnabled] = useState(true)
    const [soundEnabled, setSoundEnabled] = useState(true)
    const [emailAlerts, setEmailAlerts] = useState(true)
    const [smsAlerts, setSmsAlerts] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    // Granular Event Category Table Map State
    const [eventCategories, setEventCategories] = useState<EventCategory[]>([
        {
            id: "evt_1",
            category: "Incoming SMS & OTP Receipts",
            description: "Instant notification when new SMS code arrives for rented virtual numbers",
            pushEnabled: true,
            emailEnabled: false,
            smsEnabled: true
        },
        {
            id: "evt_2",
            category: "Security Alerts & 2FA Events",
            description: "Alerts for new device logins, password updates, and 2FA changes",
            pushEnabled: true,
            emailEnabled: true,
            smsEnabled: true
        },
        {
            id: "evt_3",
            category: "Wallet Top-up & Deposit Verification",
            description: "Confirmation when funds are successfully added to your balance",
            pushEnabled: true,
            emailEnabled: true,
            smsEnabled: false
        },
        {
            id: "evt_4",
            category: "SilentGate Node Gateway Sync",
            description: "Real-time sync notifications for connected physical SIM devices",
            pushEnabled: true,
            emailEnabled: false,
            smsEnabled: false
        },
        {
            id: "evt_5",
            category: "Number Expiration & Release Warnings",
            description: "Advance warnings before rental duration expires for active numbers",
            pushEnabled: true,
            emailEnabled: true,
            smsEnabled: true
        }
    ])

    const toggleCategorySetting = (id: string, channel: 'pushEnabled' | 'emailEnabled' | 'smsEnabled') => {
        setEventCategories(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, [channel]: !item[channel] }
            }
            return item
        }))
    }

    const handleSave = () => {
        setIsSaving(true)
        setTimeout(() => {
            setIsSaving(false)
            toast.success("Notification preferences saved successfully")
        }, 600)
    }

    return (
        <div className="space-y-6">
            {/* Global Channel Master Switches */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-white/5 flex flex-row items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-indigo-400" />
                            <CardTitle className="text-sm font-semibold text-white">Global Notification Channels</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-gray-400 mt-0.5">
                            Enable or disable primary alert delivery channels across your account.
                        </CardDescription>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-8 px-3 rounded-lg shadow-md transition-all shrink-0"
                    >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        {isSaving ? "Saving..." : "Save Preferences"}
                    </Button>
                </CardHeader>
                <CardContent className="p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Bell className="w-4 h-4 text-emerald-400" />
                            <div>
                                <p className="text-xs font-semibold text-white">Push Alerts</p>
                                <p className="text-[10px] text-gray-400">Desktop & Mobile</p>
                            </div>
                        </div>
                        <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Volume2 className="w-4 h-4 text-indigo-400" />
                            <div>
                                <p className="text-xs font-semibold text-white">Audio Sounds</p>
                                <p className="text-[10px] text-gray-400">OTP Arrival Chime</p>
                            </div>
                        </div>
                        <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Shield className="w-4 h-4 text-purple-400" />
                            <div>
                                <p className="text-xs font-semibold text-white">Email Alerts</p>
                                <p className="text-[10px] text-gray-400">Security & Billing</p>
                            </div>
                        </div>
                        <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <MessageSquare className="w-4 h-4 text-cyan-400" />
                            <div>
                                <p className="text-xs font-semibold text-white">SMS Relays</p>
                                <p className="text-[10px] text-gray-400">Urgent SMS Alerts</p>
                            </div>
                        </div>
                        <Switch checked={smsAlerts} onCheckedChange={setSmsAlerts} />
                    </div>
                </CardContent>
            </Card>

            {/* Granular Event Category Notification Table Map */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg overflow-hidden">
                <CardHeader className="pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-indigo-400" />
                        <CardTitle className="text-sm font-semibold text-white">Event Category Notification Table Map</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-gray-400">
                        Configure exact delivery rules per system event category.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-black/40 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                                    <th className="p-4">Event Category & Description</th>
                                    <th className="p-4 text-center w-28">Push</th>
                                    <th className="p-4 text-center w-28">Email</th>
                                    <th className="p-4 text-center w-28">SMS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-xs">
                                {eventCategories.map((item) => (
                                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="p-4">
                                            <p className="font-semibold text-white">{item.category}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{item.description}</p>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center">
                                                <Switch
                                                    checked={item.pushEnabled}
                                                    onCheckedChange={() => toggleCategorySetting(item.id, 'pushEnabled')}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center">
                                                <Switch
                                                    checked={item.emailEnabled}
                                                    onCheckedChange={() => toggleCategorySetting(item.id, 'emailEnabled')}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center">
                                                <Switch
                                                    checked={item.smsEnabled}
                                                    onCheckedChange={() => toggleCategorySetting(item.id, 'smsEnabled')}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
