"use client"

import { useState } from "react"
import { Shield, Key, Laptop, Smartphone, Globe, Lock, Trash2, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { TwoFactorSetup } from "./TwoFactorSetup"

interface ActiveSession {
    id: string
    device: string
    browser: string
    ip: string
    location: string
    lastActive: string
    isCurrent: boolean
}

export function SecuritySettings() {
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

    // Mock/Live Sessions Table Data
    const [sessions, setSessions] = useState<ActiveSession[]>([
        {
            id: "sess_1",
            device: "Windows PC (Chrome 128)",
            browser: "Chrome on Windows 11",
            ip: "106.192.178.184",
            location: "Mumbai, India",
            lastActive: "Active Now",
            isCurrent: true
        },
        {
            id: "sess_2",
            device: "Android Smartphone (NexNum Bot Gateway)",
            browser: "SilentGate Node v3.0",
            ip: "49.37.142.105",
            location: "Delhi, India",
            lastActive: "12 mins ago",
            isCurrent: false
        },
        {
            id: "sess_3",
            device: "MacBook Pro (Safari)",
            browser: "Safari 17.4",
            ip: "185.220.101.5",
            location: "Frankfurt, Germany",
            lastActive: "2 days ago",
            isCurrent: false
        }
    ])

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentPassword || !newPassword) {
            toast.error("Please fill in all password fields")
            return
        }
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match")
            return
        }
        if (newPassword.length < 8) {
            toast.error("Password must be at least 8 characters long")
            return
        }

        setIsUpdatingPassword(true)
        setTimeout(() => {
            setIsUpdatingPassword(false)
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            toast.success("Password updated successfully")
        }, 1000)
    }

    const revokeSession = (id: string) => {
        setSessions(prev => prev.filter(s => s.id !== id))
        toast.success("Session revoked successfully")
    }

    return (
        <div className="space-y-6">
            {/* 2-Factor Authentication Section */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-white/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-indigo-400" />
                            <CardTitle className="text-sm font-semibold text-white">Two-Factor Authentication (2FA)</CardTitle>
                        </div>
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px] h-5">
                            RECOMMENDED
                        </Badge>
                    </div>
                    <CardDescription className="text-xs text-gray-400">
                        Add an extra layer of security to your account using an authenticator app (Google Authenticator, Authy, etc.).
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5">
                    <TwoFactorSetup />
                </CardContent>
            </Card>

            {/* Password Management */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-indigo-400" />
                        <CardTitle className="text-sm font-semibold text-white">Change Password</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-gray-400">
                        Ensure your account is using a long, random password to remain secure.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5">
                    <form onSubmit={handlePasswordUpdate} className="grid md:grid-cols-3 gap-5">
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-gray-300">Current Password</Label>
                            <Input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="••••••••••••"
                                className="bg-black/30 border-white/10 text-xs h-10 focus:border-indigo-500/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-gray-300">New Password</Label>
                            <Input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="••••••••••••"
                                className="bg-black/30 border-white/10 text-xs h-10 focus:border-indigo-500/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-medium text-gray-300">Confirm New Password</Label>
                            <Input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••••••"
                                className="bg-black/30 border-white/10 text-xs h-10 focus:border-indigo-500/50"
                            />
                        </div>

                        <div className="md:col-span-3 flex justify-end">
                            <Button
                                type="submit"
                                disabled={isUpdatingPassword}
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow-md transition-all"
                            >
                                {isUpdatingPassword ? "Updating..." : "Update Password"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Active Login Sessions Table Map */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg overflow-hidden">
                <CardHeader className="pb-4 border-b border-white/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Laptop className="w-4 h-4 text-indigo-400" />
                            <CardTitle className="text-sm font-semibold text-white">Active Sessions & Devices</CardTitle>
                        </div>
                        <span className="text-xs text-gray-400">{sessions.length} active sessions</span>
                    </div>
                    <CardDescription className="text-xs text-gray-400">
                        Devices currently logged into your NexNum account.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y divide-white/5">
                        {sessions.map((session) => (
                            <div key={session.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-9 h-9 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-gray-300">
                                        {session.device.includes("Smartphone") ? <Smartphone className="w-4 h-4 text-emerald-400" /> : <Laptop className="w-4 h-4 text-indigo-400" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs font-semibold text-white">{session.device}</p>
                                            {session.isCurrent && (
                                                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[9px] h-4 px-1.5 font-mono">
                                                    THIS DEVICE
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5 font-mono">
                                            <span>{session.ip}</span>
                                            <span>•</span>
                                            <span>{session.location}</span>
                                            <span>•</span>
                                            <span>{session.lastActive}</span>
                                        </div>
                                    </div>
                                </div>

                                {!session.isCurrent && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => revokeSession(session.id)}
                                        className="h-8 px-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
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
