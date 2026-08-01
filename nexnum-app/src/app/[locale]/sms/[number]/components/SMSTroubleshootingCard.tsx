"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RefreshCw, Clock, ShieldCheck, Globe, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils/utils"

interface SMSTroubleshootingCardProps {
    className?: string
}

export function SMSTroubleshootingCard({ className }: SMSTroubleshootingCardProps) {
    const tips = [
        {
            id: 1,
            icon: RefreshCw,
            tag: "10s REFRESH",
            title: "Auto-Refresh & Instant Copy",
            text: "Messages update every 10s automatically. Tap any code to copy instantly.",
            accentBg: "bg-[hsl(var(--neon-lime))]",
            accentText: "text-black",
            accentBorder: "border-[hsl(var(--neon-lime))]",
            shadowColor: "shadow-[3px_3px_0px_0px_hsl(var(--neon-lime))]"
        },
        {
            id: 2,
            icon: Clock,
            tag: "2-MIN RULE",
            title: "No OTP After 2 Minutes?",
            text: "Cancel for a 100% instant refund and purchase a fresh number.",
            accentBg: "bg-amber-400",
            accentText: "text-black",
            accentBorder: "border-amber-400",
            shadowColor: "shadow-[3px_3px_0px_0px_#fbbf24]"
        },
        {
            id: 3,
            icon: ShieldCheck,
            tag: "ZERO RISK",
            title: "Charged Only On Receipt",
            text: "You are only charged when an SMS arrives. Zero messages received = $0 cost.",
            accentBg: "bg-emerald-400",
            accentText: "text-black",
            accentBorder: "border-emerald-400",
            shadowColor: "shadow-[3px_3px_0px_0px_#34d399]"
        },
        {
            id: 4,
            icon: Globe,
            tag: "IP MATCH",
            title: "Match VPN / Proxy Country",
            text: "Use a VPN or proxy matching the phone number's country for best success.",
            accentBg: "bg-cyan-400",
            accentText: "text-black",
            accentBorder: "border-cyan-400",
            shadowColor: "shadow-[3px_3px_0px_0px_#22d3ee]"
        },
        {
            id: 5,
            icon: Smartphone,
            tag: "TRY INCOGNITO",
            title: "Browser & Device Advice",
            text: "Still waiting? Try requesting the code again or open an Incognito tab.",
            accentBg: "bg-purple-400",
            accentText: "text-black",
            accentBorder: "border-purple-400",
            shadowColor: "shadow-[3px_3px_0px_0px_#c084fc]"
        }
    ]

    const [currentIndex, setCurrentIndex] = useState(0)
    const [isPaused, setIsPaused] = useState(false)

    useEffect(() => {
        if (isPaused) return
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % tips.length)
        }, 5000)
        return () => clearInterval(timer)
    }, [isPaused, tips.length])

    const currentTip = tips[currentIndex]
    const IconComponent = currentTip.icon

    return (
        <div
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            className={cn(
                "relative w-full rounded-xl border-2 border-white/20 bg-[#0d0e12] p-4 select-none transition-all",
                "shadow-[4px_4px_0px_0px_rgba(255,255,255,0.08)]",
                className
            )}
        >
            {/* Top Right Neobrutalist Dots */}
            <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-1.5">
                {tips.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        aria-label={`Go to tip ${idx + 1}`}
                        className={cn(
                            "h-2 rounded-full border border-black transition-all outline-none",
                            idx === currentIndex
                                ? "w-6 bg-[hsl(var(--neon-lime))] shadow-[1px_1px_0px_0px_#000]"
                                : "w-2 bg-zinc-700 hover:bg-zinc-500"
                        )}
                    />
                ))}
            </div>

            {/* Swipeable Content Box */}
            <div className="relative min-h-[76px] flex items-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentTip.id}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.2}
                        onDragEnd={(_, info) => {
                            if (info.offset.x < -40) {
                                setCurrentIndex((prev) => (prev + 1) % tips.length)
                            } else if (info.offset.x > 40) {
                                setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length)
                            }
                        }}
                        initial={{ opacity: 0, x: 15 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -15 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="w-full flex items-start gap-3 cursor-grab active:cursor-grabbing touch-pan-y"
                    >
                        {/* Neobrutalist Icon Box */}
                        <div className={cn(
                            "p-2.5 rounded-lg border-2 border-black shrink-0 font-bold",
                            currentTip.accentBg,
                            currentTip.accentText,
                            currentTip.shadowColor
                        )}>
                            <IconComponent className="h-5 w-5 stroke-[2.5]" />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1 space-y-1 pr-14">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h5 className="text-sm font-black text-white leading-tight uppercase tracking-wide">
                                    {currentTip.title}
                                </h5>
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded border text-[9px] font-mono font-extrabold uppercase tracking-wider",
                                    currentTip.accentBg,
                                    currentTip.accentText,
                                    "border-black shadow-[1px_1px_0px_0px_#000]"
                                )}>
                                    {currentTip.tag}
                                </span>
                            </div>
                            <p className="text-xs font-mono text-zinc-300 leading-relaxed">
                                {currentTip.text}
                            </p>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
