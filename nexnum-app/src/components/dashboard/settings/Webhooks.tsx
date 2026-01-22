"use client"

import { useState, useEffect } from "react"
import { Webhook, Save, RotateCw, Eye, EyeOff, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

export function Webhooks() {
    const [url, setUrl] = useState("")
    const [secret, setSecret] = useState("")
    const [showSecret, setShowSecret] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        fetchWebhook()
    }, [])

    const fetchWebhook = async () => {
        try {
            const res = await fetch('/api/webhooks/config')
            if (res.ok) {
                const data = await res.json()
                setUrl(data.url || "")
                setSecret(data.secret || "")
            }
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const saveWebhook = async () => {
        setIsSaving(true)
        try {
            const res = await fetch('/api/webhooks/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            })
            const data = await res.json()
            if (res.ok) {
                setSecret(data.secret) // In case secret was generated for the first time
                toast.success("Webhook Configuration Saved")
            } else {
                toast.error(data.error || "Failed to save")
            }
        } catch (error) {
            toast.error("Network error")
        } finally {
            setIsSaving(false)
        }
    }

    const rotateSecret = async () => {
        if (!confirm("Are you sure? This will invalidate the old secret immediately.")) return

        try {
            const res = await fetch('/api/webhooks/rotate-secret', { method: 'POST' })
            if (res.ok) {
                const data = await res.json()
                setSecret(data.secret)
                toast.success("Secret Rotated Successfully")
            }
        } catch (error) {
            toast.error("Failed to rotate secret")
        }
    }

    return (
        <div className="space-y-8">
            <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-start gap-4">
                <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
                    <Webhook className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="font-semibold text-white">Webhook Integration</h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Receive real-time updates for SMS receipts and status changes.
                        We'll send a POST request with a JSON payload to your URL.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="https://api.yourdomain.com/webhook"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="bg-black/20 border-white/10 font-mono text-sm"
                        />
                        <Button
                            onClick={saveWebhook}
                            disabled={isSaving || isLoading}
                            className="bg-indigo-600 hover:bg-indigo-700 min-w-[100px]"
                        >
                            {isSaving ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Save
                        </Button>
                    </div>
                </div>

                {secret && (
                    <div className="space-y-2 pt-4 border-t border-white/5">
                        <Label>Signing Secret</Label>
                        <p className="text-xs text-gray-500 mb-2">
                            Verify signatures using this secret. Header: <code className="text-indigo-300">X-NexNum-Signature</code>
                        </p>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Input
                                    readOnly
                                    type={showSecret ? "text" : "password"}
                                    value={secret}
                                    className="bg-black/40 border-white/10 font-mono text-emerald-400 pr-24"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-gray-400 hover:text-white"
                                        onClick={() => setShowSecret(!showSecret)}
                                    >
                                        {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-gray-400 hover:text-white"
                                        onClick={() => {
                                            navigator.clipboard.writeText(secret)
                                            toast.success("Secret copied")
                                        }}
                                    >
                                        <Copy className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                onClick={rotateSecret}
                                className="border-red-500/20 text-red-400 hover:bg-red-500/10"
                            >
                                <RotateCw className="h-4 w-4 mr-2" />
                                Rotate
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
