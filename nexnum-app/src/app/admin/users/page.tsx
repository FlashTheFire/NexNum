"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, User, Shield, Ban, CheckCircle, MoreVertical } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PremiumSkeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { AdminBackground } from "@/components/admin/AdminBackground"

// Define User Type locally since we don't have global types yet for this specific DTO
interface AdminUser {
    id: string
    email: string
    name: string
    role: "USER" | "ADMIN"
    isBanned: boolean
    createdAt: string
    _count: { numbers: number }
}

export default function UsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [search, setSearch] = useState("")

    const fetchUsers = async () => {
        setIsLoading(true)
        try {
            const res = await fetch(`/api/admin/users?q=${search}`)
            const data = await res.json()
            if (data.users) setUsers(data.users)
        } catch (error) {
            toast.error("Failed to load users")
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        const debounce = setTimeout(fetchUsers, 300)
        return () => clearTimeout(debounce)
    }, [search])

    const handleAction = async (userId: string, action: 'ban' | 'unban' | 'promote' | 'demote') => {
        try {
            const updates: any = {}
            if (action === 'ban') updates.isBanned = true
            if (action === 'unban') updates.isBanned = false
            if (action === 'promote') updates.role = 'ADMIN'
            if (action === 'demote') updates.role = 'USER'

            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, ...updates })
            })

            if (res.ok) {
                toast.success(`User ${action} successful`)
                fetchUsers() // Refresh
            } else {
                toast.error("Action failed")
            }
        } catch {
            toast.error("Something went wrong")
        }
    }

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <span className="w-2 h-8 bg-[hsl(var(--neon-lime))] rounded-full shadow-[0_0_15px_hsl(var(--neon-lime))]" />
                        User Management
                    </h1>
                </div>
                <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder="Search users..."
                        className="pl-9 bg-[#111318] border-white/10"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid gap-4">
                {isLoading ? (
                    [1, 2, 3].map(i => <PremiumSkeleton key={i} className="h-20 w-full" />)
                ) : (
                    users.map((user, i) => (
                        <motion.div
                            key={user.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-[#111318]/60 border border-white/5 rounded-xl p-4 flex items-center justify-between hover:border-[hsl(var(--neon-lime))/20] transition-colors group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-white transition-colors">
                                    <User size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-white flex items-center gap-2">
                                        {user.name}
                                        {user.role === 'ADMIN' && (
                                            <span className="bg-purple-500/10 text-purple-400 text-[10px] px-1.5 py-0.5 rounded border border-purple-500/20">ADMIN</span>
                                        )}
                                        {user.isBanned && (
                                            <span className="bg-red-500/10 text-red-400 text-[10px] px-1.5 py-0.5 rounded border border-red-500/20">BANNED</span>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-500">{user.email} • {user._count.numbers} numbers</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {user.isBanned ? (
                                    <Button size="sm" variant="ghost" className="text-green-400 hover:text-green-300 hover:bg-green-400/10" onClick={() => handleAction(user.id, 'unban')}>
                                        <CheckCircle size={16} className="mr-2" /> Unban
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-400/10" onClick={() => handleAction(user.id, 'ban')}>
                                        <Ban size={16} className="mr-2" /> Ban
                                    </Button>
                                )}

                                {user.role === 'USER' ? (
                                    <Button size="sm" variant="ghost" className="text-purple-400 hover:text-purple-300 hover:bg-purple-400/10" onClick={() => handleAction(user.id, 'promote')}>
                                        <Shield size={16} className="mr-2" /> Promote
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white" onClick={() => handleAction(user.id, 'demote')}>
                                        Demote
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    )
}
