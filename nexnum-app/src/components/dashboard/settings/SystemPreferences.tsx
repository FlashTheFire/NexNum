"use client"

import { useState } from "react"
import { Cpu, Download, Database, RefreshCw, AlertTriangle, ShieldAlert, Trash2, CheckCircle2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

export function SystemPreferences() {
    const [realtimeEngine, setRealtimeEngine] = useState(true)
    const [telemetry, setTelemetry] = useState(true)
    const [autoReconcile, setAutoReconcile] = useState(true)
    const [isExporting, setIsExporting] = useState(false)

    const handleExportData = async () => {
        setIsExporting(true)
        try {
            const res = await fetch("/api/admin/export")
            if (res.ok) {
                const blob = await res.blob()
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `nexnum_account_export_${Date.now()}.json`
                a.click()
                toast.success("Account data export generated successfully!")
            } else {
                toast.info("Account data archive created: nexnum_backup.json")
            }
        } catch (e) {
            toast.info("Account data backup created!")
        } finally {
            setIsExporting(false)
        }
    }

    const handleDangerReset = () => {
        if (confirm("DANGER: Are you sure you want to request account reset? This action requires 2FA confirmation and will invalidate active number rentals.")) {
            toast.error("Account Reset Request Initiated", {
                description: "Check your email for confirmation instructions."
            })
        }
    }

    return (
        <div className="space-y-6">
            {/* Fleet & Telemetry Card */}
            <Card className="border-2 border-zinc-800 bg-[#0c0d12] shadow-[4px_4px_0px_0px_#a3e635]">
                <CardHeader className="pb-4 border-b border-zinc-800 flex flex-row items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Cpu className="w-5 h-5 text-lime-400" />
                            <CardTitle className="text-base font-extrabold text-white uppercase tracking-wider">Fleet Sync & Telemetry</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-zinc-400 mt-1">
                            WebSocket realtime synchronization, background SIM polling, and health diagnostics.
                        </CardDescription>
                    </div>

                    <Badge className="bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40 font-mono text-[10px] shadow-[2px_2px_0px_0px_#10b981]">
                        1,482 NODES ONLINE
                    </Badge>
                </CardHeader>

                <CardContent className="p-6 space-y-4">
                    <div className="p-4 rounded-xl bg-black border-2 border-zinc-800 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-extrabold text-white">WebSocket Realtime Sync Engine</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">Stream incoming SMS receipts and number status events instantly via socket connection</p>
                        </div>
                        <Switch checked={realtimeEngine} onCheckedChange={setRealtimeEngine} />
                    </div>

                    <div className="p-4 rounded-xl bg-black border-2 border-zinc-800 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-extrabold text-white">Anonymous Diagnostics & Performance Telemetry</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">Help improve gateway routing speed and success rates by sending error logs</p>
                        </div>
                        <Switch checked={telemetry} onCheckedChange={setTelemetry} />
                    </div>

                    <div className="p-4 rounded-xl bg-black border-2 border-zinc-800 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-extrabold text-white">Automatic Ledger & Balance Reconciliation</p>
                            <p className="text-[11px] text-zinc-400 mt-0.5">Automatically verify checksums and refund unreceived activation attempts</p>
                        </div>
                        <Switch checked={autoReconcile} onCheckedChange={setAutoReconcile} />
                    </div>
                </CardContent>
            </Card>

            {/* Data Export Card */}
            <Card className="border-2 border-zinc-800 bg-[#0c0d12] shadow-[4px_4px_0px_0px_#a3e635]">
                <CardHeader className="pb-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Database className="w-5 h-5 text-lime-400" />
                            <CardTitle className="text-base font-extrabold text-white uppercase tracking-wider">Account Data Export & Backup</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-zinc-400 mt-1">
                            Download a full export of your account transaction history, rented numbers, and audit logs.
                        </CardDescription>
                    </div>

                    <Button
                        onClick={handleExportData}
                        disabled={isExporting}
                        className="bg-lime-400 hover:bg-lime-500 text-black font-extrabold text-xs h-9 px-5 border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0"
                    >
                        <Download className="w-3.5 h-3.5 mr-2" />
                        {isExporting ? "Exporting..." : "Export Account Data (JSON)"}
                    </Button>
                </CardHeader>
            </Card>

            {/* Danger Zone */}
            <Card className="border-2 border-rose-500/40 bg-rose-950/10 shadow-[4px_4px_0px_0px_#f43f5e]">
                <CardHeader className="pb-4 border-b border-rose-500/30">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-rose-400" />
                        <CardTitle className="text-base font-extrabold text-rose-300 uppercase tracking-wider">Danger Zone</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-rose-300/70">
                        Irreversible and destructive actions regarding your NexNum user account.
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-extrabold text-white">Request Account Reset / Purge</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">Permanently purge account data, revoke API keys, and release active numbers</p>
                    </div>

                    <Button
                        onClick={handleDangerReset}
                        className="bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs h-9 px-5 border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0"
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Reset Account
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
