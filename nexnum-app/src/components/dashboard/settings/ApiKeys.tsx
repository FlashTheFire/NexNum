"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Key, Copy, Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils/utils"

interface ApiKey {
    id: string
    name: string
    key: string
    lastUsedAt: string | null
    createdAt: string
}

export function ApiKeys() {
    const [keys, setKeys] = useState<ApiKey[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [newKeyName, setNewKeyName] = useState("")

    useEffect(() => {
        fetchKeys()
    }, [])

    const fetchKeys = async () => {
        try {
            const res = await fetch('/api/keys')
            if (res.ok) {
                const data = await res.json()
                setKeys(data.keys || [])
            }
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const createKey = async () => {
        if (!newKeyName.trim()) return
        setIsCreating(true)
        try {
            const res = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName })
            })
            const data = await res.json()
            if (res.ok) {
                setKeys(prev => [data.key, ...prev])
                setNewKeyName("")
                toast.success("API Key Created", {
                    description: "Make sure to copy it now. You won't see it again."
                })
            } else {
                toast.error(data.error || "Failed to create key")
            }
        } catch (error) {
            toast.error("Network error")
        } finally {
            setIsCreating(false)
        }
    }

    const deleteKey = async (id: string) => {
        try {
            const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' })
            if (res.ok) {
                setKeys(prev => prev.filter(k => k.id !== id))
                toast.success("API Key Revoked")
            }
        } catch (error) {
            toast.error("Failed to revoke key")
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success("Copied to clipboard")
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 space-y-2 w-full">
                    <Label>Create New API Key</Label>
                    <div className="flex gap-2">
                        <Input
                            placeholder="e.g. Production App"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            className="bg-black/20 border-white/10"
                        />
                        <Button
                            onClick={createKey}
                            disabled={!newKeyName.trim() || isCreating}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white min-w-[100px]"
                        >
                            {isCreating ? <Loader2 className="animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                            Create
                        </Button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Active Keys</h3>
                {isLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="animate-spin text-gray-500" /></div>
                ) : keys.length === 0 ? (
                    <div className="p-8 text-center bg-white/5 rounded-xl border border-white/5 text-gray-500">
                        No API keys found. Create one to access the API.
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {keys.map(key => (
                            <div key={key.id} className="p-4 rounded-xl bg-[#12141a]/50 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="space-y-1 overflow-hidden w-full md:w-auto">
                                    <div className="flex items-center gap-2">
                                        <Key className="h-4 w-4 text-emerald-400" />
                                        <span className="font-medium text-white">{key.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-black/30 p-1.5 rounded-lg w-full max-w-md">
                                        <code className="text-xs font-mono text-gray-300 truncate flex-1">
                                            {key.key.substring(0, 12)}...{key.key.substring(key.key.length - 4)}
                                        </code>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 hover:text-white"
                                            onClick={() => copyToClipboard(key.key)}
                                        >
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <p className="text-[10px] text-gray-500">
                                        Created: {new Date(key.createdAt).toLocaleDateString()} • Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full md:w-auto"
                                    onClick={() => deleteKey(key.id)}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Revoke
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
