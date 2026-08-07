"use client"

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Bell, Volume2, Shield, CreditCard, MessageSquare, Zap, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
        setPrefs(prev => prev ? { ...prev, [key]: newValue } : null)

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
            setPrefs(prev => prev ? { ...prev, [key]: !newValue } : null)
        }
    }

    if (loading) {
        return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--neon-lime))]" /></div>
    }

    if (!prefs) return <div className="p-4 text-red-400 font-bold">Error loading settings preferences.</div>

    return (
        <div className="space-y-6">
            <div className="border-2 border-white/15 bg-black/40 rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)] space-y-4">
                <h3 className="text-xs font-black text-[hsl(var(--neon-lime))] uppercase tracking-wider px-1">Global Notification Channels</h3>

                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[hsl(var(--neon-lime))/0.5] transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-[hsl(var(--neon-lime))/0.15] border border-[hsl(var(--neon-lime))/0.3] flex items-center justify-center text-[hsl(var(--neon-lime))]">
                            <Bell className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-white">Browser Push Notifications</p>
                            <p className="text-xs text-gray-400">Receive real-time desktop & mobile browser alerts</p>
                        </div>
                    </div>
                    <Switch checked={prefs.pushEnabled} onCheckedChange={() => handleToggle('pushEnabled')} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[hsl(var(--neon-lime))/0.5] transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                            <Volume2 className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-white">Audio & Sound Effects</p>
                            <p className="text-xs text-gray-400">Play sound effect when new SMS code arrives</p>
                        </div>
                    </div>
                    <Switch checked={prefs.soundEnabled} onCheckedChange={() => handleToggle('soundEnabled')} />
                </div>
            </div>

            <div className="border-2 border-white/15 bg-black/40 rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.8)] space-y-4">
                <h3 className="text-xs font-black text-[hsl(var(--neon-lime))] uppercase tracking-wider px-1">Detailed Event Categories</h3>

                <SettingRow
                    icon={MessageSquare} iconColor="text-[hsl(var(--neon-lime))]" iconBg="bg-[hsl(var(--neon-lime))/0.15] border border-[hsl(var(--neon-lime))/0.3]"
                    label="SMS & Verification Codes"
                    desc="Instant alerts for incoming OTPs and numbers"
                    checked={prefs.smsReceived}
                    onChange={() => handleToggle('smsReceived')}
                />

                <SettingRow
                    icon={CreditCard} iconColor="text-emerald-400" iconBg="bg-emerald-500/15 border border-emerald-500/30"
                    label="Wallet & Balance Activity"
                    desc="Top-ups, deposit confirmations, and balance alerts"
                    checked={prefs.billing}
                    onChange={() => handleToggle('billing')}
                />

                <SettingRow
                    icon={Shield} iconColor="text-orange-400" iconBg="bg-orange-500/15 border border-orange-500/30"
                    label="Security & Account Activity"
                    desc="New device logins and password updates"
                    checked={prefs.security}
                    onChange={() => handleToggle('security')}
                />

                <SettingRow
                    icon={Zap} iconColor="text-yellow-400" iconBg="bg-yellow-500/15 border border-yellow-500/30"
                    label="System News & Feature Updates"
                    desc="Platform enhancements and announcements"
                    checked={prefs.promotions}
                    onChange={() => handleToggle('promotions')}
                />
            </div>
        </div>
    )
}

function SettingRow({ icon: Icon, iconColor, iconBg, label, desc, checked, onChange }: any) {
    return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-[hsl(var(--neon-lime))/0.5] transition-colors">
            <div className="flex items-center gap-3">
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", iconBg, iconColor)}>
                    <Icon className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-sm font-black text-white">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                </div>
            </div>
            <Switch checked={checked} onCheckedChange={onChange} />
        </div>
    )
}
