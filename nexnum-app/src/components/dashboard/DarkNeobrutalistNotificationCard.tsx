"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Sparkles, X, ArrowRight, ShieldCheck, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DarkNeobrutalistNotificationCardProps {
    title?: string
    message?: string
    badgeText?: string
    actionText?: string
    onAction?: () => void
    onClose?: () => void
}

export function DarkNeobrutalistNotificationCard({
    title = "System Update v3.0 Active",
    message = "Declarative Firebase RTDB engine and multi-node fleet routing are fully synchronized.",
    badgeText = "ONLINE FLEET",
    actionText = "View Live Stats",
    onAction,
    onClose,
}: DarkNeobrutalistNotificationCardProps) {
    const [isVisible, setIsVisible] = useState(true)

    const handleDismiss = () => {
        setIsVisible(false)
        if (onClose) onClose()
    }

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9, rotate: -1 }}
                    animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, y: 50, scale: 0.9 }}
                    transition={{ type: "spring", damping: 20, stiffness: 260 }}
                    className="fixed bottom-6 right-6 z-50 max-w-md w-[calc(100vw-3rem)]"
                >
                    {/* Dark Neo-Brutalist Frame */}
                    <div className="relative group bg-[#0e1017] border-2 border-black dark:border-white/20 rounded-2xl p-5 shadow-[6px_6px_0px_0px_hsl(var(--neon-lime))] transition-all duration-300 hover:shadow-[8px_8px_0px_0px_hsl(var(--neon-lime))] hover:-translate-x-0.5 hover:-translate-y-0.5">
                        
                        {/* Ambient Neo Glow */}
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-[hsl(var(--neon-lime))/0.15] rounded-full blur-2xl pointer-events-none" />

                        {/* Top Header Row */}
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[hsl(var(--neon-lime))] text-black shadow-[2px_2px_0px_0px_#000]">
                                    <Zap className="h-3 w-3 fill-current" />
                                    {badgeText}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 font-mono">
                                    <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--neon-lime))]" />
                                    Encrypted
                                </span>
                            </div>

                            <button
                                onClick={handleDismiss}
                                className="h-7 w-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                aria-label="Close notification"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="space-y-2">
                            <h4 className="text-base font-black text-white flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-[hsl(var(--neon-lime))]" />
                                {title}
                            </h4>
                            <p className="text-xs text-gray-300 leading-relaxed font-sans">
                                {message}
                            </p>
                        </div>

                        {/* Action Bar */}
                        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                            <span className="text-[11px] text-gray-400 font-mono">
                                Realtime Sync • 0ms
                            </span>

                            {actionText && (
                                <motion.div whileTap={{ scale: 0.95 }}>
                                    <Button
                                        onClick={() => {
                                            if (onAction) onAction()
                                            handleDismiss()
                                        }}
                                        size="sm"
                                        className="h-8 px-4 rounded-xl bg-white text-black hover:bg-[hsl(var(--neon-lime))] font-bold text-xs shadow-[3px_3px_0px_0px_#000] border border-black transition-all flex items-center gap-1.5"
                                    >
                                        {actionText}
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </Button>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
