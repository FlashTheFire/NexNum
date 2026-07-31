"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Sparkles,
    RefreshCw,
    Clock,
    Globe,
    Smartphone,
    ShieldCheck,
    RotateCcw,
    ChevronDown,
    HelpCircle,
    Info
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils/utils"

interface SMSTroubleshootingCardProps {
    className?: string
}

export function SMSTroubleshootingCard({ className }: SMSTroubleshootingCardProps) {
    const [isExpanded, setIsExpanded] = useState(true)

    const tips = [
        {
            icon: RefreshCw,
            iconColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
            title: "Auto-Refresh & Fast Copy",
            description: "Messages auto-refresh every 10 seconds. Click on any received code to copy it instantly."
        },
        {
            icon: Clock,
            iconColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
            title: "2-Minute OTP Rule & Instant Refund",
            description: "If OTP doesn't arrive within 2 minutes, cancel the purchase to receive a 100% full refund immediately."
        },
        {
            icon: RotateCcw,
            iconColor: "text-blue-400 bg-blue-500/10 border-blue-500/20",
            title: "Re-send SMS Code",
            description: "Try requesting the SMS message again inside the app or website you are registering for."
        },
        {
            icon: Globe,
            iconColor: "text-purple-400 bg-purple-500/10 border-purple-500/20",
            title: "Matching IP & VPN Country",
            description: "Ensure your IP address / VPN country matches the country of the phone number you bought."
        },
        {
            icon: Smartphone,
            iconColor: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
            title: "Switch Browser or Device",
            description: "If verification fails, try using Incognito mode, a different web browser, or a different mobile device."
        },
        {
            icon: ShieldCheck,
            iconColor: "text-lime-400 bg-lime-500/10 border-lime-500/20",
            title: "Zero Risk Guarantee",
            description: "You are only charged for successfully received SMS codes. No SMS = No Cost."
        }
    ]

    return (
        <Card className={cn(
            "relative overflow-hidden transition-all duration-300 border-amber-500/20",
            "bg-gradient-to-br from-amber-500/[0.08] via-[#14161d]/80 to-[#0c0d11]/90",
            "backdrop-blur-xl shadow-[0_8px_32px_rgba(245,158,11,0.06)] rounded-2xl",
            className
        )}>
            {/* Top Glowing Ambient Border */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            <div className="p-4 md:p-5">
                {/* Header Row */}
                <div 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center justify-between cursor-pointer select-none group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)] group-hover:scale-105 transition-transform">
                            <Sparkles className="h-4.5 w-4.5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-amber-100 group-hover:text-white transition-colors">
                                    Troubleshooting & OTP Guide
                                </h4>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-wide">
                                    100% Refundable
                                </span>
                            </div>
                            <p className="text-[11px] text-amber-500/70 mt-0.5">
                                Can't receive SMS? Follow these quick tips
                            </p>
                        </div>
                    </div>

                    <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 group-hover:text-white group-hover:bg-white/10 transition-all">
                        <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", isExpanded && "rotate-180")} />
                    </div>
                </div>

                {/* Collapsible Content */}
                <AnimatePresence initial={false}>
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="pt-4 mt-3 border-t border-amber-500/10 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {tips.map((tip, idx) => {
                                    const IconComponent = tip.icon
                                    return (
                                        <div 
                                            key={idx}
                                            className="p-3 rounded-xl bg-black/30 border border-white/5 hover:border-amber-500/20 hover:bg-black/50 transition-all group/item flex items-start gap-3"
                                        >
                                            <div className={cn("p-2 rounded-lg border shrink-0 mt-0.5 transition-transform group-hover/item:scale-110", tip.iconColor)}>
                                                <IconComponent className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h5 className="text-xs font-semibold text-gray-200 group-hover/item:text-white transition-colors leading-tight mb-1">
                                                    {tip.title}
                                                </h5>
                                                <p className="text-[11px] text-gray-400 leading-normal">
                                                    {tip.description}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Footer Notice */}
                            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15 flex items-center gap-2.5">
                                <Info className="h-4 w-4 text-amber-400 shrink-0" />
                                <p className="text-[11px] text-amber-200/90 leading-tight">
                                    <span className="font-semibold text-amber-300">Need a new number?</span> Click <span className="font-semibold text-white">"Next Number"</span> or cancel anytime before expiration for instant credit refund.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Card>
    )
}
