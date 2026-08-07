"use client"

import { useState, useEffect } from "react"
import { Key, Plus, Copy, Check, Trash2, Shield, ExternalLink, Loader2, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import Link from "next/link"

interface ApiKeyItem {
    id: string
    name: string
    key?: string
    prefix: string
    permissions: string[]
    lastUsedAt?: string
    createdAt: string
}

export function ApiKeys() {
    const [keys, setKeys] = useState<ApiKeyItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [newKeyName, setNewKeyName] = useState("")
    const [newCreatedKey, setNewCreatedKey] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)

    useEffect(() => {
        fetchKeys()
    }, [])

    const fetchKeys = async () => {
        setIsLoading(true)
        try {
            const res = await fetch("/api/keys")
            const data = await res.json()
            if (res.ok && data.keys) {
                setKeys(data.keys)
            }
        } catch (e) {
            toast.error("Failed to load API keys")
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateKey = async () => {
        if (!newKeyName.trim()) {
            toast.error("Please enter a name for the API key")
            return
        }

        setIsCreating(true)
        try {
            const res = await fetch("/api/keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newKeyName.trim() })
            })

            const data = await res.json()
            if (res.ok && data.apiKey) {
                setNewCreatedKey(data.apiKey.key)
                toast.success("API key generated successfully!")
                setNewKeyName("")
                fetchKeys()
            } else {
                toast.error(data.error || "Failed to create API key")
            }
        } catch (e) {
            toast.error("Network error creating API key")
        } finally {
            setIsCreating(false)
        }
    }

    const handleRevokeKey = async (id: string) => {
        if (!confirm("Are you sure you want to revoke this API key? Applications using this key will immediately lose access.")) {
            return
        }

        try {
            const res = await fetch(`/api/keys/${id}`, { method: "DELETE" })
            if (res.ok) {
                toast.success("API key revoked")
                fetchKeys()
            } else {
                toast.error("Failed to revoke key")
            }
        } catch (e) {
            toast.error("Error revoking key")
        }
    }

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        toast.success("Copied to clipboard")
        setTimeout(() => setCopiedId(null), 2000)
    }

    return (
        <div className="space-y-6">
            {/* Header with Full API Docs Button */}
            <Card className="border-2 border-zinc-800 bg-[#0c0d12] shadow-[4px_4px_0px_0px_#a3e635]">
                <CardHeader className="pb-4 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Key className="w-5 h-5 text-lime-400" />
                            <CardTitle className="text-base font-extrabold text-white uppercase tracking-wider">REST API Access Tokens</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-zinc-400 mt-1">
                            Authenticate programmatically with our high-throughput SMS verification API.
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Link href="/api-docs" target="_blank">
                            <Button variant="outline" className="border-2 border-lime-400 bg-lime-400/10 text-lime-400 hover:bg-lime-400 hover:text-black font-extrabold text-xs h-9 px-4 shadow-[2px_2px_0px_0px_#a3e635] transition-all cursor-pointer">
                                <BookOpen className="w-3.5 h-3.5 mr-2" />
                                View Full API Documentation
                                <ExternalLink className="w-3 h-3 ml-1.5" />
                            </Button>
                        </Link>
                    </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                    {/* Create New Key Input Form */}
                    <div className="p-4 rounded-xl bg-black border-2 border-zinc-800 space-y-3">
                        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Create New API Token</label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Key Label (e.g. Production Automation Bot)"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                className="bg-zinc-900 border-zinc-700 text-xs text-white h-10 focus:border-lime-400 font-mono"
                            />
                            <Button
                                onClick={handleCreateKey}
                                disabled={isCreating || !newKeyName.trim()}
                                className="bg-lime-400 hover:bg-lime-500 text-black font-extrabold text-xs h-10 px-5 border-2 border-black shadow-[2px_2px_0px_0px_#000] shrink-0 cursor-pointer"
                            >
                                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1.5" /> Generate Token</>}
                            </Button>
                        </div>

                        {newCreatedKey && (
                            <div className="p-3 rounded-lg bg-lime-500/10 border border-lime-500/30 space-y-1">
                                <p className="text-[11px] font-bold text-lime-400">Save your new API token now (it won't be shown again):</p>
                                <div className="flex items-center justify-between bg-black p-2 rounded border border-zinc-800 font-mono text-xs text-white">
                                    <span className="truncate">{newCreatedKey}</span>
                                    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(newCreatedKey, "new")} className="h-7 px-2 text-xs text-lime-400">
                                        {copiedId === "new" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* API Keys Table Map */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active API Keys ({keys.length})</h4>
                        {isLoading ? (
                            <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-lime-400" /> Loading tokens...
                            </div>
                        ) : keys.length > 0 ? (
                            <div className="divide-y divide-zinc-800 border-2 border-zinc-800 rounded-xl overflow-hidden bg-black">
                                {keys.map((k) => (
                                    <div key={k.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/50 transition-colors">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-extrabold text-white">{k.name}</span>
                                                <Badge className="bg-zinc-800 text-lime-400 border-zinc-700 font-mono text-[10px]">
                                                    {k.prefix || "nex_live_..."}
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-zinc-500 font-mono mt-1">Created: {new Date(k.createdAt).toLocaleDateString()}</p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                onClick={() => handleRevokeKey(k.id)}
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 px-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Revoke Token
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-xs text-zinc-500 border-2 border-dashed border-zinc-800 rounded-xl">
                                No API keys found. Generate a token to get started.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
