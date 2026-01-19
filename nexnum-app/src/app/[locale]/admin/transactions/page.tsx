"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, Filter, ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, ShoppingCart } from "lucide-react"

type Transaction = {
    id: string
    amount: string
    type: 'topup' | 'purchase' | 'refund'
    description: string
    createdAt: string
    wallet: {
        user: {
            email: string
            name: string
        }
    }
}

export default function AdminTransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [type, setType] = useState('all')
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    const fetchTransactions = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                search,
                type
            })
            const res = await fetch(`/api/admin/transactions?${params}`)
            const data = await res.json()
            if (data.transactions) {
                setTransactions(data.transactions)
                setTotalPages(data.pages)
            }
        } catch (error) {
            console.error("Failed to fetch transactions", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const timeout = setTimeout(() => {
            fetchTransactions()
        }, 500)
        return () => clearTimeout(timeout)
    }, [page, search, type])

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'topup': return <ArrowDownLeft size={16} className="text-green-400" />
            case 'purchase': return <ShoppingCart size={16} className="text-blue-400" />
            case 'refund': return <ArrowUpRight size={16} className="text-yellow-400" />
            default: return null
        }
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'topup': return 'text-green-400 bg-green-400/10 border-green-400/20'
            case 'purchase': return 'text-blue-400 bg-blue-400/10 border-blue-400/20'
            case 'refund': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
            default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20'
        }
    }

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Transactions</h1>
                    <p className="text-gray-400">View and filter all system transactions.</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input
                        type="text"
                        placeholder="Search by user email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[hsl(var(--neon-lime))] transition-colors"
                    />
                </div>
                <div className="relative w-full md:w-64">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[hsl(var(--neon-lime))] appearance-none cursor-pointer"
                    >
                        <option value="all">All Types</option>
                        <option value="topup">Topups</option>
                        <option value="purchase">Purchases</option>
                        <option value="refund">Refunds</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-[#0a0a0c] border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/5">
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        Loading transactions...
                                    </td>
                                </tr>
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        No transactions found.
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((tx) => (
                                    <motion.tr
                                        key={tx.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="group hover:bg-white/[0.02] transition-colors"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                            {new Date(tx.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-white">{tx.wallet.user.name}</span>
                                                <span className="text-xs text-gray-500">{tx.wallet.user.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTypeColor(tx.type)}`}>
                                                {getTypeIcon(tx.type)}
                                                {tx.type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {tx.description}
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${tx.type === 'topup' ? 'text-green-400' : 'text-white'}`}>
                                            {tx.type === 'topup' ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft size={20} className="text-white" />
                    </button>
                    <span className="text-sm text-gray-400">
                        Page <span className="text-white font-medium">{page}</span> of <span className="text-white font-medium">{totalPages}</span>
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight size={20} className="text-white" />
                    </button>
                </div>
            </div>
        </div>
    )
}
