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

    const handleExportData = () => {
        setIsExporting(true)
        setTimeout(() => {
            setIsExporting(false)
            toast.success("Account data backup archive created", {
                description: "nexnum_account_export_2026.json downloaded successfully."
            })
        }, 1200)
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
            {/* Realtime Fleet & System Engine Status */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-white/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-indigo-400" />
                            <CardTitle className="text-sm font-semibold text-white">Fleet Engine & System Telemetry</CardTitle>
                        </div>
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]">
                            FLEET ONLINE (1,482 NODES)
                        </Badge>
                    </div>
                    <CardDescription className="text-xs text-gray-400">
                        Configure background polling frequency, WebSocket realtime synchronization, and system diagnostics.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                    <div className="p-4 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-white">WebSocket Realtime Sync Engine</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">Stream incoming SMS receipts and number status events instantly via socket connection</p>
                        </div>
                        <Switch checked={realtimeEngine} onCheckedChange={setRealtimeEngine} />
                    </div>

                    <div className="p-4 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-white">Anonymous Diagnostics & Performance Telemetry</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">Help improve gateway routing speed and success rates by sending error logs</p>
                        </div>
                        <Switch checked={telemetry} onCheckedChange={setTelemetry} />
                    </div>

                    <div className="p-4 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-white">Automatic Ledger & Balance Reconciliation</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">Automatically verify checksums and refund unreceived activation attempts</p>
                        </div>
                        <Switch checked={autoReconcile} onCheckedChange={setAutoReconcile} />
                    </div>
                </CardContent>
            </Card>

            {/* Data Export & Backup */}
            <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-white/5 flex flex-row items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-indigo-400" />
                            <CardTitle className="text-sm font-semibold text-white">Data Export & Backup</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-gray-400 mt-0.5">
                            Download a full export of your account transaction history, rented numbers, and audit logs.
                        </CardDescription>
                    </div>

                    <Button
                        onClick={handleExportData}
                        disabled={isExporting}
                        variant="outline"
                        size="sm"
                        className="border-white/10 bg-white/5 hover:bg-white/10 text-xs h-9 px-4 shrink-0"
                    >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        {isExporting ? "Exporting..." : "Export All Data (JSON)"}
                    </Button>
                </CardHeader>
            </Card>

            {/* Danger Zone */}
            <Card className="border-rose-500/20 bg-rose-950/10 backdrop-blur-md shadow-lg">
                <CardHeader className="pb-4 border-b border-rose-500/20">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        <CardTitle className="text-sm font-semibold text-rose-200">Danger Zone</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-rose-300/70">
                        Irreversible and destructive actions regarding your NexNum user account.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold text-white">Request Account Reset / Deletion</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Permanently purge your account data, revoke API keys, and release active numbers</p>
                    </div>

                    <Button
                        onClick={handleDangerReset}
                        size="sm"
                        className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow-md transition-all shrink-0"
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Reset Account
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
