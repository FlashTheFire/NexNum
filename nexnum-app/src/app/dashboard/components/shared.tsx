import { Bell, ShoppingCart, ArrowRight, ChevronRight, ArrowUpRight, Gift } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useGlobalStore } from "@/store"
import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

import { formatPrice, formatRelativeTime } from "@/lib/utils"

// Notifications Component (Shared)
export function NotificationsBtn() {
    const [isOpen, setIsOpen] = useState(false)
    const { transactions } = useGlobalStore()
    const [unreadCount, setUnreadCount] = useState(3) // Mock unread count

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (isOpen && !(e.target as Element).closest('.notifications-container')) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    const recentActivity = transactions.slice(0, 5)

    return (
        <div className="relative notifications-container">
            <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-xl border-white/10 hover:bg-white/5 bg-[#0f172a] relative"
                onClick={() => {
                    setIsOpen(!isOpen)
                    if (!isOpen) setUnreadCount(0)
                }}
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[#0f172a]" />
                )}
            </Button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 top-full mt-2 w-80 md:w-96 rounded-2xl border border-white/10 bg-[#0f172a]/95 backdrop-blur-xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-white/5">
                            <h3 className="font-semibold">Notifications</h3>
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
                                Mark all read
                            </Button>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto">
                            {recentActivity.length > 0 ? (
                                <div className="py-2">
                                    {recentActivity.map((tx) => (
                                        <div key={tx.id} className="px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer flex gap-3">
                                            <div className={`mt-1 p-2 rounded-full shrink-0 h-8 w-8 flex items-center justify-center ${tx.type === 'topup' ? 'bg-emerald-500/10 text-emerald-500' :
                                                tx.type === 'purchase' ? 'bg-indigo-500/10 text-indigo-500' :
                                                    'bg-amber-500/10 text-amber-500'
                                                }`}>
                                                {tx.type === 'topup' ? <ArrowUpRight className="h-4 w-4" /> :
                                                    tx.type === 'purchase' ? <ShoppingCart className="h-4 w-4" /> :
                                                        <Gift className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium leading-none mb-1">{tx.description}</p>
                                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <span>{formatRelativeTime(tx.createdAt)}</span>
                                                    <span>•</span>
                                                    <span className={tx.amount >= 0 ? "text-emerald-400" : "text-foreground"}>
                                                        {tx.amount > 0 ? '+' : ''}{formatPrice(tx.amount)}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-muted-foreground">
                                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No notifications yet</p>
                                </div>
                            )}
                        </div>

                        <div className="p-2 border-t border-white/5 bg-white/5">
                            <Link href="/dashboard/history">
                                <Button variant="ghost" className="w-full h-8 text-xs justify-between group">
                                    View all activity
                                    <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                                </Button>
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
