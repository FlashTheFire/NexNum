
"use client"

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Bell, Volume2, Shield, CreditCard, MessageSquare, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/utils'

interface Preferences {
    smsReceived: boolean
    promotions: boolean
    billing: boolean
    security: boolean
    system: boolean
    soundEnabled: boolean
    pushEnabled: boolean
    emailEnabled: boolean
}

export function NotificationSettings() {
    const [prefs, setPrefs] = useState<Preferences | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/notifications/preferences')
            .then(res => res.json())
            .then(data => {
                setPrefs(data)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load preferences', err)
                setLoading(false)
            })
    }, [])

    const handleToggle = async (key: keyof Preferences) => {
        if (!prefs) return

        const newValue = !prefs[key]
        setPrefs(prev => prev ? { ...prev, [key]: newValue } : null) // Optimistic update

        try {
            const res = await fetch('/api/notifications/preferences', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: newValue })
            })

            if (!res.ok) throw new Error('Failed to update')
            toast.success('Preference updated')
        } catch (error) {
            toast.error('Failed to save preference')
            setPrefs(prev => prev ? { ...prev, [key]: !newValue } : null) // Revert
        }
    }

    if (loading) {
        return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
    }

    if (!prefs) return <div className="p-4 text-red-400">Error loading settings.</div>

    return (
        <div className="space-y-6">
            <div className="border border-white/10 bg-[#12141a]/50 rounded-xl overflow-hidden p-1">
                <div className="p-4 bg-white/[0.02] rounded-lg border border-white/5 space-y-4">
                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">Global Channels</h3>

                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                                <Bell className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Push Notifications</p>
                                <p className="text-xs text-gray-500">Receive browser alerts</p>
                            </div>
                        </div>
                        <Switch checked={prefs.pushEnabled} onCheckedChange={() => handleToggle('pushEnabled')} />
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                <Volume2 className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Sound Effects</p>
                                <p className="text-xs text-gray-500">Play sound on notification</p>
                            </div>
                        </div>
                        <Switch checked={prefs.soundEnabled} onCheckedChange={() => handleToggle('soundEnabled')} />
                    </div>
                </div>
            </div>

            <div className="border border-white/10 bg-[#12141a]/50 rounded-xl overflow-hidden p-1">
                <div className="p-4 bg-white/[0.02] rounded-lg border border-white/5 space-y-4">
                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">Detailed Categories</h3>

                    <SettingRow
                        icon={MessageSquare} iconColor="text-[hsl(var(--neon-lime))]" iconBg="bg-[hsl(var(--neon-lime))/0.1]"
                        label="SMS & Messages"
                        desc="Alerts for new Verification Codes"
                        checked={prefs.smsReceived}
                        onChange={() => handleToggle('smsReceived')}
                    />

                    <SettingRow
                        icon={CreditCard} iconColor="text-emerald-400" iconBg="bg-emerald-500/10"
                        label="Billing & Payments"
                        desc="Top-ups, refunds, and low balance"
                        checked={prefs.billing}
                        onChange={() => handleToggle('billing')}
                    />

                    <SettingRow
                        icon={Shield} iconColor="text-orange-400" iconBg="bg-orange-500/10"
                        label="Security & Account"
                        desc="Login alerts and system updates"
                        checked={prefs.security}
                        onChange={() => handleToggle('security')}
                    />

                    <SettingRow
                        icon={Zap} iconColor="text-yellow-400" iconBg="bg-yellow-500/10"
                        label="Promotions"
                        desc="Offers and news"
                        checked={prefs.promotions}
                        onChange={() => handleToggle('promotions')}
                    />
                </div>
            </div>
        </div>
    )
}

function SettingRow({ icon: Icon, iconColor, iconBg, label, desc, checked, onChange }: any) {
    return (
        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
            <div className="flex items-center gap-3">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", iconBg, iconColor)}>
                    <Icon className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                </div>
            </div>
            <Switch checked={checked} onCheckedChange={onChange} />
        </div>
    )
}
