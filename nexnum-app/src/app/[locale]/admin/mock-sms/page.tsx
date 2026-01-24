"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import {
    RefreshCw, Send, Trash, AlertCircle, Terminal,
    Clock, MessageSquare, CheckCircle, XCircle, ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/utils"

interface MockOrder {
    id: string
    phoneNumber: string
    countryCode: string
    serviceCode: string
    status: string
    cost: number
    smsMessages: Array<{ code: string; text: string; receivedAt: string }>
    createdAt: string
    nextSmsAt?: number
    isWaitingNext?: boolean
}

interface RequestLog {
    id: string
    timestamp: string
    action: string
    params: Record<string, string>
    response: string
    duration: number
}

export default function MockSMSManager() {
    const [orders, setOrders] = useState<MockOrder[]>([])
    const [logs, setLogs] = useState<RequestLog[]>([])
    const [balance, setBalance] = useState("0.00")
    const [isLoading, setIsLoading] = useState(true)
    const [autoRefresh, setAutoRefresh] = useState(true)
    const logsEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const fetchState = async () => {
            try {
                const res = await fetch('/api/mock-sms?action=debug_state')
                if (!res.ok) {
                    console.error('API returned non-OK status', res.status)
                    return
                }
                const text = await res.text()
                if (!text) {
                    console.error('Empty response from API')
                    return
                }
                const data = JSON.parse(text)
                setOrders(data.orders || [])
                setLogs(data.logs || [])
                setBalance(data.balance || "0.00")
            } catch (error) {
                console.error('Failed to fetch mock state', error)
            } finally {
                setIsLoading(false)
            }
        }

        fetchState()
        if (autoRefresh) {
            const interval = setInterval(fetchState, 1500)
            return () => clearInterval(interval)
        }
    }, [autoRefresh])

    const handleForceSMS = async (id: string) => {
        try {
            await fetch(`/api/mock-sms?action=force_sms&id=${id}`)
            toast.success("SMS Triggered!")
        } catch (error) {
            toast.error("Failed to trigger SMS")
        }
    }

    const handleCancel = async (id: string) => {
        try {
            await fetch(`/api/mock-sms?action=setStatus&id=${id}&status=8`)
            toast.success("Order Cancelled")
        } catch (error) {
            toast.error("Failed to cancel")
        }
    }

    const getActionColor = (action: string) => {
        switch (action) {
            case 'getNumber':
            case 'getNumberV2':
                return 'text-purple-400'
            case 'getStatus':
                return 'text-blue-400'
            case 'setStatus':
                return 'text-orange-400'
            case 'force_sms':
                return 'text-emerald-400'
            default:
                return 'text-zinc-400'
        }
    }

    const getResponseColor = (response: string) => {
        if (response.startsWith('ACCESS') || response.startsWith('STATUS_OK') || response === 'SUCCESS') {
            return 'text-emerald-400'
        }
        if (response.startsWith('STATUS_WAIT')) {
            return 'text-yellow-400'
        }
        if (response.startsWith('ERROR') || response.startsWith('BAD') || response.startsWith('NO_')) {
            return 'text-red-400'
        }
        return 'text-zinc-400'
    }

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-3">
                            <Terminal className="w-6 h-6 text-[hsl(var(--neon-lime))]" />
                            Mock SMS API Terminal
                        </h1>
                        <p className="text-zinc-500 text-sm mt-1">Real-time monitoring & control panel</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-zinc-500">Balance:</span>
                            <span className="font-mono text-emerald-400">${balance}</span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={cn(
                                "border-white/10",
                                autoRefresh ? "text-emerald-400 border-emerald-500/30" : "text-zinc-500"
                            )}
                        >
                            <RefreshCw className={cn("w-4 h-4 mr-2", autoRefresh && "animate-spin")} />
                            {autoRefresh ? "Live" : "Paused"}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Active Orders Panel */}
                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                            <h2 className="font-semibold flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                                Active Sessions ({orders.length})
                            </h2>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
                            {orders.length === 0 ? (
                                <div className="p-8 text-center text-zinc-600">
                                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    No active sessions
                                </div>
                            ) : (
                                orders.map(order => (
                                    <div key={order.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-mono text-lg text-white">{order.phoneNumber}</span>
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] uppercase font-bold",
                                                        order.status === 'received' ? 'bg-emerald-500/20 text-emerald-400' :
                                                            order.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                                                                    'bg-blue-500/20 text-blue-400'
                                                    )}>
                                                        {order.status}
                                                    </span>
                                                    {order.isWaitingNext && (
                                                        <span className="flex items-center gap-1 text-[10px] text-orange-400 animate-pulse">
                                                            <Clock className="w-3 h-3" />
                                                            Waiting Next
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-zinc-500 font-mono">
                                                    ID:{order.id} • {order.serviceCode}/{order.countryCode} • ${order.cost}
                                                </div>
                                                {/* SMS Messages */}
                                                {order.smsMessages.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {order.smsMessages.map((msg, i) => (
                                                            <div key={i} className="text-xs pl-2 border-l-2 border-emerald-500/50">
                                                                <span className="text-emerald-400 font-mono font-bold">{msg.code}</span>
                                                                <span className="text-zinc-600 mx-2">•</span>
                                                                <span className="text-zinc-500">{new Date(msg.receivedAt).toLocaleTimeString()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Actions */}
                                            {!['cancelled', 'completed', 'refunded'].includes(order.status) && (
                                                <div className="flex gap-1 shrink-0">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 px-2 text-emerald-400 hover:bg-emerald-500/10"
                                                        onClick={() => handleForceSMS(order.id)}
                                                    >
                                                        <Send className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 px-2 text-red-400 hover:bg-red-500/10"
                                                        onClick={() => handleCancel(order.id)}
                                                    >
                                                        <Trash className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Request Log Panel */}
                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-blue-400" />
                                Request Log
                            </h2>
                            <span className="text-xs text-zinc-600 font-mono">{logs.length} entries</span>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto font-mono text-xs">
                            {logs.length === 0 ? (
                                <div className="p-8 text-center text-zinc-600">
                                    No requests logged yet
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead className="bg-black/30 sticky top-0">
                                        <tr className="text-left text-zinc-500">
                                            <th className="px-3 py-2 font-medium">Time</th>
                                            <th className="px-3 py-2 font-medium">Action</th>
                                            <th className="px-3 py-2 font-medium">Params</th>
                                            <th className="px-3 py-2 font-medium">Response</th>
                                            <th className="px-3 py-2 font-medium text-right">ms</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {logs.map(log => (
                                            <tr key={log.id} className="hover:bg-white/[0.02]">
                                                <td className="px-3 py-2 text-zinc-600 whitespace-nowrap">
                                                    {new Date(log.timestamp).toLocaleTimeString()}
                                                </td>
                                                <td className={cn("px-3 py-2 whitespace-nowrap", getActionColor(log.action))}>
                                                    {log.action}
                                                </td>
                                                <td className="px-3 py-2 text-zinc-500 max-w-[150px] truncate">
                                                    {Object.entries(log.params)
                                                        .filter(([k]) => k !== 'action')
                                                        .map(([k, v]) => `${k}=${v}`)
                                                        .join(', ') || '-'}
                                                </td>
                                                <td className={cn("px-3 py-2 max-w-[200px] truncate", getResponseColor(log.response))}>
                                                    {log.response}
                                                </td>
                                                <td className="px-3 py-2 text-right text-zinc-600">
                                                    {log.duration}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
