"use client"

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Trash2, Copy, Plus, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

interface BannedIcon {
    id: string
    hash: string
    description: string | null
    createdAt: string
}

export function BannedIconsTable() {
    const [icons, setIcons] = useState<BannedIcon[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)

    // Create Form
    const [isOpen, setIsOpen] = useState(false)
    const [newHash, setNewHash] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        fetchIcons()
    }, [page])

    const fetchIcons = async () => {
        try {
            const res = await fetch(`/api/admin/banned-icons?page=${page}&limit=10`)
            if (res.ok) {
                const data = await res.json()
                setIcons(data.items)
                setHasMore(data.pagination.pages > page)
            }
        } catch (e) {
            toast.error("Failed to load banned icons")
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async () => {
        if (!newHash || newHash.length !== 64) {
            toast.error("Hash must be exactly 64 characters (SHA-256)")
            return
        }

        setSubmitting(true)
        try {
            const res = await fetch('/api/admin/banned-icons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hash: newHash, description: newDesc })
            })

            if (res.ok) {
                toast.success("Icon banned successfully")
                setIsOpen(false)
                setNewHash('')
                setNewDesc('')
                fetchIcons()
            } else {
                const err = await res.json()
                toast.error(err.error || "Failed to ban icon")
            }
        } catch (e) {
            toast.error("An error occurred")
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (hash: string) => {
        if (!confirm("Are you sure you want to unban this icon?")) return

        try {
            const res = await fetch(`/api/admin/banned-icons?hash=${hash}`, {
                method: 'DELETE'
            })

            if (res.ok) {
                toast.success("Icon unbanned")
                fetchIcons()
            } else {
                toast.error("Failed to unban")
            }
        } catch (e) {
            toast.error("Error unbanning icon")
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium text-white">Banned Icons</h3>
                    <p className="text-sm text-gray-400">Block specific service icons (e.g. offensive or incorrect images) by their SHA-256 hash.</p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-red-600 hover:bg-red-700 text-white gap-2">
                            <Plus className="w-4 h-4" />
                            Ban Icon
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-gray-900 border-gray-800 text-white">
                        <DialogHeader>
                            <DialogTitle>Ban New Icon</DialogTitle>
                            <DialogDescription>
                                Enter the SHA-256 hash of the image file you want to block permanently.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>SHA-256 Hash</Label>
                                <Input
                                    className="bg-gray-800 border-gray-700 font-mono text-xs"
                                    placeholder="be311539..."
                                    value={newHash}
                                    onChange={(e) => setNewHash(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Description (Optional)</Label>
                                <Input
                                    className="bg-gray-800 border-gray-700"
                                    placeholder="e.g. 5sim Bad Bear"
                                    value={newDesc}
                                    onChange={(e) => setNewDesc(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsOpen(false)} className="border-gray-700 text-gray-300">Cancel</Button>
                            <Button onClick={handleCreate} disabled={submitting} className="bg-red-600 hover:bg-red-700">
                                {submitting ? "Banning..." : "Ban Icon"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border border-gray-800 bg-gray-900/50 overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-900">
                        <TableRow className="border-gray-800 hover:bg-gray-900">
                            <TableHead className="text-gray-400">Description</TableHead>
                            <TableHead className="text-gray-400">Hash</TableHead>
                            <TableHead className="text-gray-400 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center text-gray-500">Loading...</TableCell>
                            </TableRow>
                        ) : icons.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="h-24 text-center text-gray-500">No banned icons found.</TableCell>
                            </TableRow>
                        ) : (
                            icons.map((icon) => (
                                <TableRow key={icon.id} className="border-gray-800 hover:bg-gray-800/50">
                                    <TableCell className="font-medium text-white">{icon.description || "No description"}</TableCell>
                                    <TableCell className="font-mono text-xs text-gray-400 truncate max-w-[200px]">
                                        {icon.hash}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-gray-400 hover:text-white"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(icon.hash)
                                                    toast.success("Hash copied")
                                                }}
                                            >
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                onClick={() => handleDelete(icon.hash)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {hasMore || page > 1 ? (
                <div className="flex justify-center gap-2 pt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        className="border-gray-700 text-gray-300"
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasMore}
                        onClick={() => setPage(p => p + 1)}
                        className="border-gray-700 text-gray-300"
                    >
                        Next
                    </Button>
                </div>
            ) : null}
        </div>
    )
}
