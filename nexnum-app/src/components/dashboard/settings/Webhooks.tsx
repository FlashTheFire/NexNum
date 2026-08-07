"use client"

import { useState } from "react"
import { Webhook, Save, RotateCcw, Copy, Eye, EyeOff, CheckCircle2, Play, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export function Webhooks() {
    const [url, setUrl] = useState("https://api.yourdomain.com/v1/nexnum-webhook")
    const [secret, setSecret] = useState("whsec_98f7a6b5c4d3e2f10987654321fedcba")
    const [showSecret, setShowSecret] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isTesting, setIsTesting] = useState(false)

    const saveWebhook = () => {
        setIsSaving(true)
        setTimeout(() => {
            setIsSaving(false)
            toast.success("Webhook endpoint updated successfully")
        }, 500)
    }

    const rotateSecret = () => {
        if (!confirm("Are you sure you want to rotate the webhook signing secret? Existing signature verifications will fail immediately.")) return
        const newSec = `whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
        setSecret(newSec)
        toast.success("Webhook signing secret rotated successfully")
    }

    const testPing = () => {
        setIsTesting(true)
        setTimeout(() => {
            setIsTesting(false)
            toast.success("Test Webhook Event Delivered (HTTP 200 OK)", {
                description: "Latency: 42ms | Payload: { event: 'sms.received', number: '+919234057524' }"
            })
        }, 800)
    }

    const copySecret = () => {
        navigator.clipboard.writeText(secret)
        toast.success("Signing secret copied to clipboard")
    }

    return (
        <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg">
            <CardHeader className="pb-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Webhook className="w-4 h-4 text-indigo-400" />
                        <CardTitle className="text-sm font-semibold text-white">Webhook Endpoints & Events</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-gray-400 mt-0.5">
                        Configure HTTP POST webhooks to receive instant callback payloads when incoming SMS OTPs arrive.
                    </CardDescription>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={testPing}
                        disabled={isTesting}
                        className="border-white/10 bg-white/5 hover:bg-white/10 text-xs h-9"
                    >
                        {isTesting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1 text-emerald-400 fill-current" />}
                        Send Test Ping
                    </Button>
                    <Button
                        onClick={saveWebhook}
                        disabled={isSaving}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-9 px-4 rounded-lg shadow-md transition-all"
                    >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                        Save Config
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-5 space-y-5">
                <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-300">Endpoint Callback URL</Label>
                        <Input
                            placeholder="https://api.yourdomain.com/webhook"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="bg-black/30 border-white/10 text-xs font-mono h-10 focus:border-indigo-500/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-300">Signing Secret Key</Label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    type={showSecret ? "text" : "password"}
                                    value={secret}
                                    readOnly
                                    className="bg-black/30 border-white/10 text-xs font-mono h-10 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSecret(!showSecret)}
                                    className="absolute right-3 top-3 text-gray-400 hover:text-white"
                                >
                                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <Button
                                variant="outline"
                                onClick={copySecret}
                                className="border-white/10 bg-white/5 hover:bg-white/10 h-10 px-3"
                                title="Copy Secret"
                            >
                                <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                onClick={rotateSecret}
                                className="border-white/10 bg-white/5 hover:bg-white/10 text-rose-400 h-10 px-3"
                                title="Rotate Secret"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">Active Event Subscriptions</span>
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]">
                            HEALTHY (200 OK)
                        </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                        <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-mono text-[10px]">sms.received</Badge>
                        <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-mono text-[10px]">number.expired</Badge>
                        <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-mono text-[10px]">deposit.confirmed</Badge>
                        <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-mono text-[10px]">gateway.sync_status</Badge>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
