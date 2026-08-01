"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    RefreshCw,
    Clock,
    ShieldCheck,
    Globe,
    Smartphone
} from "lucide-react"
import { cn } from "@/lib/utils/utils"

interface SMSTroubleshootingCardProps {
    className?: string
}

export function SMSTroubleshootingCard({ className }: SMSTroubleshootingCardProps) {
    const tips = [
        {
            id: 1,
            icon: RefreshCw,
            badge: "Instant Copy",
            title: "Auto-Refresh & Instant Copy",
            text: "Messages auto-refresh every 10s. Click on any verification code to copy it instantly to your clipboard.",
            highlightColor: "text-[hsl(var(--neon-lime))]",
            badgeBg: "bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] border-[hsl(var(--neon-lime)/0.3)]"
        },
        {
            id: 2,
            icon: Clock,
            badge: "100% Refundable",
            title: "2-Minute OTP Recommendation",
            text: "If the OTP doesn't arrive within 2 minutes, we recommend cancelling the purchase and trying a new number.",
            highlightColor: "text-amber-400",
            badgeBg: "bg-amber-500/15 text-amber-300 border-amber-500/30"
        },
        {
            id: 3,
            icon: ShieldCheck,
            badge: "Zero Risk",
            title: "Charged Only On Success",
            text: "Don't worry, you are strictly charged for successful SMS receptions. No message received = 0 cost.",
            highlightColor: "text-emerald-400",
            badgeBg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
        },
        {
            id: 4,
            icon: Globe,
            badge: "Location Match",
            title: "IP Address & Country Sync",
            text: "Your IP address' country should be the same as the country of the phone number bought. Be sure to use Proxy or VPN.",
            highlightColor: "text-cyan-400",
            badgeBg: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
        },
        {
            id: 5,
            icon: Smartphone,
            badge: "Device Tip",
            title: "Different Browser or Device",
            text: "Can't receive SMS? Try requesting the message again, or use Incognito mode / a different browser or device for signing up.",
            highlightColor: "text-purple-400",
            badgeBg: "bg-purple-500/15 text-purple-300 border-purple-500/30"
        }
    ]

    const [currentIndex, setCurrentIndex] = useState(0)
    const [isPaused, setIsPaused] = useState(false)

    // 5-second auto scroll timer
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
                "relative w-full rounded-2xl border overflow-hidden transition-all duration-300",
                "bg-gradient-to-br from-[#13151a] via-[#101217] to-[#0d0e12]",
                "border-white/10 shadow-lg p-4 md:p-5",
                className
            )}
        >
            {/* Top Right Floating Dots */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
                {tips.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        aria-label={`Go to tip ${idx + 1}`}
                        className={cn(
                            "h-1.5 rounded-full transition-all duration-300 outline-none",
                            idx === currentIndex
                                ? "w-5 bg-[hsl(var(--neon-lime))] shadow-[0_0_8px_hsl(var(--neon-lime)/0.6)]"
                                : "w-1.5 bg-white/20 hover:bg-white/40"
                        )}
                    />
                ))}
            </div>

            {/* Swipeable Carousel Area (Touch Drag / Swipe Support) */}
            <div className="relative min-h-[90px] flex items-center select-none">
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
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="w-full flex items-start gap-3.5 cursor-grab active:cursor-grabbing touch-pan-y"
                    >
                        <div className="p-3 rounded-xl border shrink-0 bg-[#1a1d24] border-white/10 shadow-md">
                            <IconComponent className={cn("h-5 w-5", currentTip.highlightColor)} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1 pr-16">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h5 className="text-sm font-semibold text-white leading-tight">
                                    {currentTip.title}
                                </h5>
                                <span className={cn("px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide", currentTip.badgeBg)}>
                                    {currentTip.badge}
                                </span>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed font-normal">
                                {currentTip.text}
                            </p>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
