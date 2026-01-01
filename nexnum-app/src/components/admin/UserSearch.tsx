"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Search, X, Filter, User, Mail, Calendar,
    CreditCard, Phone, Shield, Ban, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'

interface SearchResult {
    id: string
    email: string
    name: string
    role: 'USER' | 'ADMIN'
    isBanned: boolean
    createdAt: string
    hasWallet: boolean
    totalSpent: string
    numbersCount: number
}

interface UserSearchProps {
    onSelect?: (user: SearchResult) => void
    className?: string
}

export function UserSearch({ onSelect, className = '' }: UserSearchProps) {
    const [query, setQuery] = useState('')
    const [role, setRole] = useState<string>('')
    const [status, setStatus] = useState<string>('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [loading, setLoading] = useState(false)
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [showFilters, setShowFilters] = useState(false)
    const [focused, setFocused] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const debouncedQuery = useDebounce(query, 300)

    const search = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (debouncedQuery) params.set('q', debouncedQuery)
            if (role) params.set('role', role)
            if (status) params.set('status', status)
            params.set('page', page.toString())

            const res = await fetch(`/api/admin/users/search?${params}`)
            if (res.ok) {
                const data = await res.json()
                setResults(data.users)
                setTotalPages(data.pagination.totalPages)
            }
        } catch (error) {
            console.error('Search failed:', error)
        } finally {
            setLoading(false)
        }
    }, [debouncedQuery, role, status, page])

    useEffect(() => {
        search()
    }, [search])

    // Reset page when filters change
    useEffect(() => {
        setPage(1)
    }, [debouncedQuery, role, status])

    const clearFilters = () => {
        setQuery('')
        setRole('')
        setStatus('')
        setPage(1)
    }

    const hasFilters = query || role || status

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Search bar */}
            <div className="relative">
                <div className={`flex items-center gap-2 px-4 py-3 bg-gray-800/50 border rounded-xl transition-all ${focused ? 'border-violet-500 ring-2 ring-violet-500/20' : 'border-gray-700'
                    }`}>
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        placeholder="Search users by email or name..."
                        className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            className="p-1 hover:bg-gray-700 rounded transition-colors"
                        >
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    )}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`p-2 rounded-lg transition-colors ${showFilters || hasFilters
                                ? 'bg-violet-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:text-white'
                            }`}
                    >
                        <Filter className="w-4 h-4" />
                    </button>
                </div>

                {/* Filters dropdown */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-10 top-full mt-2 left-0 right-0 bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-xl"
                        >
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Role</label>
                                    <select
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    >
                                        <option value="">All roles</option>
                                        <option value="USER">User</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Status</label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    >
                                        <option value="">All status</option>
                                        <option value="active">Active</option>
                                        <option value="banned">Banned</option>
                                    </select>
                                </div>
                            </div>
                            {hasFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="mt-4 text-sm text-violet-400 hover:text-violet-300 transition-colors"
                                >
                                    Clear all filters
                                </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Results */}
            <div className="space-y-2">
                {loading ? (
                    <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-20 bg-gray-800/50 rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No users found</p>
                    </div>
                ) : (
                    results.map((user, i) => (
                        <motion.div
                            key={user.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => onSelect?.(user)}
                            className={`p-4 bg-gray-800/30 border border-gray-700/50 rounded-lg hover:border-violet-500/50 hover:bg-gray-800/50 transition-all ${onSelect ? 'cursor-pointer' : ''
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.role === 'ADMIN'
                                            ? 'bg-violet-500/20 text-violet-400'
                                            : 'bg-gray-700 text-gray-400'
                                        }`}>
                                        {user.role === 'ADMIN' ? (
                                            <Shield className="w-5 h-5" />
                                        ) : (
                                            <User className="w-5 h-5" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-white">{user.name}</p>
                                            {user.isBanned && (
                                                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full flex items-center gap-1">
                                                    <Ban className="w-3 h-3" />
                                                    Banned
                                                </span>
                                            )}
                                            {user.role === 'ADMIN' && (
                                                <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-xs rounded-full">
                                                    Admin
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-400 flex items-center gap-1">
                                            <Mail className="w-3 h-3" />
                                            {user.email}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-gray-400 flex items-center gap-1 justify-end">
                                        <CreditCard className="w-3 h-3" />
                                        ${user.totalSpent}
                                    </p>
                                    <p className="text-xs text-gray-500 flex items-center gap-1 justify-end mt-1">
                                        <Phone className="w-3 h-3" />
                                        {user.numbersCount} numbers
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-gray-400 text-sm">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    )
}

export default UserSearch
