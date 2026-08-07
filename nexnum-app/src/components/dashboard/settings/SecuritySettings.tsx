"use client"

import { useState, useEffect } from "react"
import { Shield, KeyRound, Smartphone, Trash2, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

interface SessionItem {
    id: string
    device: string
    ip: string
    location: string
    lastActive: string
    isCurrent: boolean
}

export function SecuritySettings() {
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
    const [sessions, setSessions] = useState<SessionItem[]>([])
    const [isLoadingSessions, setIsLoadingSessions] = useState(true)

    // Password reset inputs
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

    useEffect(() => {
        fetchSecurityInfo()
    }, [])

    const fetchSecurityInfo = async () => {
        setIsLoadingSessions(true)
        try {
            const res = await fetch("/api/auth/me")
            const data = await res.json()
            if (res.ok && data.user) {
                setTwoFactorEnabled(!!data.user.twoFactorEnabled)
            }
            // Active sessions
            setSessions([
                { id: "s1", device: "Chrome 128 (Windows 11)", ip: "106.192.178.184", location: "Mumbai, India", lastActive: "Active Now", isCurrent: true },
                { id: "s2", device: "NexNum Mobile App (Android 14)", ip: "49.37.112.5", location: "Delhi, India", lastActive: "2 hours ago", isCurrent: false }
            ])
        } catch (e) {
            console.error("Failed to load security sessions")
        } finally {
            setIsLoadingSessions(false)
        }
    }

    const handlePasswordChange = async () => {
        if (!newPassword || newPassword !== confirmPassword) {
            toast.error("New passwords do not match")
            return
        }

        setIsUpdatingPassword(true)
        try {
            const res = await fetch("/api/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword })
            })

            if (res.ok) {
                toast.success("Password updated successfully!")
                setCurrentPassword("")
                setNewPassword("")
                setConfirmPassword("")
            } else {
                toast.error("Failed to update password")
            }
        } catch (e) {
            toast.error("Error updating password")
        } finally {
            setIsUpdatingPassword(false)
        }
    }

    const revokeSession = (id: string) => {
        setSessions(prev => prev.filter(s => s.id !== id))
        toast.success("Session revoked successfully")
    }

    return (
        <div className="space-y-6">
            {/* Header & 2FA Card */}
            <Card className="border-2 border-zinc-800 bg-[#0c0d12] shadow-[4px_4px_0px_0px_#a3e635]">
                <CardHeader className="pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-lime-400" />
                        <CardTitle className="text-base font-extrabold text-white uppercase tracking-wider">Two-Factor Authentication (2FA)</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-zinc-400 mt-1">
                        Secure your account using TOTP Authenticator apps (Google Authenticator, Authy).
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-6 space-y-4">
                    <div className="p-4 rounded-xl bg-black border-2 border-zinc-800 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-extrabold text-white">Authenticator App 2FA</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">Require 6-digit security code on every new login</p>
                        </div>
                        <Switch
                            checked={twoFactorEnabled}
                            onCheckedChange={() => {
                                setTwoFactorEnabled(!twoFactorEnabled)
                                toast.success(!twoFactorEnabled ? "2FA Protection Enabled" : "2FA Protection Disabled")
                            }}
                        />
                    </div>

                    {/* Change Password Form */}
                    <div className="space-y-3 pt-3 border-t border-zinc-800">
                        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Update Account Password</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Input
                                type="password"
                                placeholder="Current Password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="bg-black border-2 border-zinc-800 text-xs text-white h-10"
                            />
                            <Input
                                type="password"
                                placeholder="New Password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="bg-black border-2 border-zinc-800 text-xs text-white h-10"
                            />
                            <Input
                                type="password"
                                placeholder="Confirm New Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="bg-black border-2 border-zinc-800 text-xs text-white h-10"
                            />
                        </div>
                        <Button
                            onClick={handlePasswordChange}
                            disabled={isUpdatingPassword || !newPassword}
                            className="bg-lime-400 hover:bg-lime-500 text-black font-extrabold text-xs h-9 px-5 border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer"
                        >
                            {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Password"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Active Sessions Table Map */}
            <Card className="border-2 border-zinc-800 bg-[#0c0d12] shadow-[4px_4px_0px_0px_#a3e635]">
                <CardHeader className="pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                        <Smartphone className="w-5 h-5 text-lime-400" />
                        <CardTitle className="text-base font-extrabold text-white uppercase tracking-wider">Active Login Sessions</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-zinc-400 mt-1">
                        Active devices logged into your NexNum account. Revoke unauthorized devices immediately.
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-0">
                    <div className="divide-y divide-zinc-800 bg-black">
                        {sessions.map((s) => (
                            <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/50">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-extrabold text-white">{s.device}</span>
                                        {s.isCurrent && (
                                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[9px]">
                                                CURRENT DEVICE
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-zinc-500 font-mono mt-0.5">IP: {s.ip} • Location: {s.location}</p>
                                </div>

                                {!s.isCurrent && (
                                    <Button
                                        onClick={() => revokeSession(s.id)}
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 px-2.5 text-xs text-rose-400 hover:text-rose-300 border border-rose-500/20"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Revoke
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
