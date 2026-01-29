'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Plus, ShieldAlert, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface BannedIcon {
    id: string
    hash: string
    description?: string
    createdAt: string
}

export default function BannedIconsPage() {
    const [icons, setIcons] = useState<BannedIcon[]>([])
    const [loading, setLoading] = useState(true)
    const [newHash, setNewHash] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const fetchIcons = async () => {
        try {
            const res = await fetch('/api/admin/assets/banned-icons')
            if (res.ok) {
                const data = await res.json()
                setIcons(data)
            }
        } catch (error) {
            toast.error("Failed to load banned icons")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchIcons()
    }, [])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newHash) return

        setSubmitting(true)
        try {
            const res = await fetch('/api/admin/assets/banned-icons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hash: newHash, description: newDesc })
            })

            if (res.ok) {
                toast.success("Banned Icon Added")
                setNewHash('')
                setNewDesc('')
                fetchIcons()
            } else {
                toast.error("Failed to add icon")
            }
        } catch {
            toast.error("Error adding icon")
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to unban this icon?")) return

        try {
            const res = await fetch(`/api/admin/assets/banned-icons?id=${id}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                toast.success("Icon unbanned")
                fetchIcons()
            } else {
                toast.error("Failed to delete")
            }
        } catch {
            toast.error("Error deleting icon")
        }
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <ShieldAlert className="text-red-500" />
                        Asset Protection
                    </h1>
                    <p className="text-gray-400 mt-2">Manage banned icon hashes to keep your inventory clean.</p>
                </div>
                <Button variant="outline" onClick={fetchIcons} disabled={loading}>
                    <RefreshCw size={16} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                {/* Add Form */}
                <Card className="bg-[#111318] border-white/10 h-fit">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">Ban New Hash</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400">SHA-256 Hash</label>
                                <Input
                                    placeholder="e.g. be3115..."
                                    value={newHash}
                                    onChange={e => setNewHash(e.target.value)}
                                    className="bg-black/20 border-white/10 font-mono text-xs"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400">Description (Optional)</label>
                                <Input
                                    placeholder="Reason (e.g. Offensive Icon)"
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                    className="bg-black/20 border-white/10"
                                />
                            </div>
                            <Button type="submit" className="w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20" disabled={submitting}>
                                <Plus size={16} className="mr-2" />
                                {submitting ? 'Adding...' : 'Add to Ban List'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* List */}
                <Card className="md:col-span-2 bg-[#111318] border-white/10">
                    <CardHeader>
                        <CardTitle className="text-lg text-white flex justify-between">
                            <span>Banned Hashes</span>
                            <span className="text-sm font-normal text-gray-500">{icons.length} entries</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-gray-400 w-[100px]">Added</TableHead>
                                    <TableHead className="text-gray-400">Description</TableHead>
                                    <TableHead className="text-gray-400">Hash</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {icons.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                                            No banned icons found. Check logs for candidates.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    icons.map((icon) => (
                                        <TableRow key={icon.id} className="border-white/5 hover:bg-white/5 group">
                                            <TableCell className="text-gray-500 text-xs whitespace-nowrap">
                                                {new Date(icon.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="font-medium text-gray-300">
                                                {icon.description || '-'}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-gray-500 truncate max-w-[200px]" title={icon.hash}>
                                                {icon.hash.substring(0, 16)}...
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => handleDelete(icon.id)}
                                                >
                                                    <Trash2 size={14} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
