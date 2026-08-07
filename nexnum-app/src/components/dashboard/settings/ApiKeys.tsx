"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Key, Copy, Check, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { api } from "@/lib/api/api-client"

interface ApiKeyItem {
    id: string
    name: string
    key: string
    scopes: string[]
    lastUsedAt: string | null
    createdAt: string
}

export function ApiKeys() {
    const [keys, setKeys] = useState<ApiKeyItem[]>([
        {
            id: "key_1",
            name: "Production Gateway Service",
            key: "nex_live_9a8f37b2d1e04c5a9b8c7d6e5f4a3b2c1",
            scopes: ["read:numbers", "write:sms", "read:balance"],
            lastUsedAt: "2 mins ago",
            createdAt: "2026-07-28"
        },
        {
            id: "key_2",
            name: "Staging Test Integration",
            key: "nex_live_7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1",
            scopes: ["read:numbers", "read:balance"],
            lastUsedAt: "3 days ago",
            createdAt: "2026-06-15"
        }
    ])
    const [isLoading, setIsLoading] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [newKeyName, setNewKeyName] = useState("")

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success("API key copied to clipboard")
    }

    const createKey = async () => {
        if (!newKeyName.trim()) return
        setIsCreating(true)
        setTimeout(() => {
            const newObj: ApiKeyItem = {
                id: `key_${Date.now()}`,
                name: newKeyName,
                key: `nex_live_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
                scopes: ["read:numbers", "write:sms", "read:balance"],
                lastUsedAt: "Never",
                createdAt: new Date().toISOString().split("T")[0]
            }
            setKeys(prev => [newObj, ...prev])
            setNewKeyName("")
            setIsCreating(false)
            toast.success("API key created successfully", {
                description: "Make sure to copy your key now. You won't be able to see it again."
            })
        }, 500)
    }

    const deleteKey = (id: string) => {
        setKeys(prev => prev.filter(k => k.id !== id))
        toast.success("API key revoked")
    }

    return (
        <Card className="border-white/10 bg-[#12131a]/80 backdrop-blur-md shadow-lg overflow-hidden">
            <CardHeader className="pb-4 border-b border-white/5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-indigo-400" />
                            <CardTitle className="text-sm font-semibold text-white">API Keys & Tokens</CardTitle>
                        </div>
                        <CardDescription className="text-xs text-gray-400 mt-0.5">
                            Manage API authentication tokens to interact with the NexNum SMS Gateway REST API programmatically.
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Key description (e.g. Production)"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            className="bg-black/30 border-white/10 text-xs h-9 w-60 focus:border-indigo-500/50"
                        />
                        <Button
                            onClick={createKey}
                            disabled={!newKeyName.trim() || isCreating}
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-9 px-3 rounded-lg shadow-md transition-all shrink-0"
                        >
                            {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
                            Generate Key
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-black/40 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                                <th className="p-4">Key Name & Token Prefix</th>
                                <th className="p-4">Permissions / Scopes</th>
                                <th className="p-4">Last Used</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-xs">
                            {keys.map((item) => (
                                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="p-4">
                                        <p className="font-semibold text-white">{item.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <code className="text-[11px] font-mono text-indigo-300 bg-indigo-950/40 border border-indigo-500/20 px-2 py-0.5 rounded">
                                                {item.key.slice(0, 14)}••••••••••••••••
                                            </code>
                                            <button
                                                onClick={() => copyToClipboard(item.key)}
                                                className="text-gray-400 hover:text-white p-1"
                                                title="Copy Key"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-wrap gap-1">
                                            {item.scopes.map(sc => (
                                                <Badge key={sc} variant="outline" className="text-[9px] font-mono border-white/10 text-gray-300 bg-white/5 px-1.5 h-4">
                                                    {sc}
                                                </Badge>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-400 font-mono text-[11px]">
                                        {item.lastUsedAt || "Never"}
                                    </td>
                                    <td className="p-4 text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => deleteKey(item.id)}
                                            className="h-8 px-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Revoke
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    )
}
