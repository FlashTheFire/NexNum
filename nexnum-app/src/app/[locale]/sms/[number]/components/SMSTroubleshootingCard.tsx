"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Sparkles,
    RefreshCw,
    Clock,
    ShieldCheck,
    Globe,
    Smartphone,
    ChevronLeft,
    ChevronRight,
    HelpCircle
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
            title: "Auto-Refresh Every 10s",
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
            text: "Your IP address' country should match the country of the phone number bought. Be sure to use a matching Proxy or VPN.",
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
    const [direction, setDirection] = useState(1) // 1 = forward, -1 = backward

    // 5-second auto scroll timer
    useEffect(() => {
        if (isPaused) return

        const timer = setInterval(() => {
            setDirection(1)
            setCurrentIndex((prev) => (prev + 1) % tips.length)
        }, 5000)

        return () => clearInterval(timer)
    }, [isPaused, tips.length])

    const handleNext = () => {
        setDirection(1)
        setCurrentIndex((prev) => (prev + 1) % tips.length)
    }

    const handlePrev = () => {
        setDirection(-1)
        setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length)
    }

    const handleDotClick = (index: number) => {
        setDirection(index > currentIndex ? 1 : -1)
        setCurrentIndex(index)
    }

    const currentTip = tips[currentIndex]
    const IconComponent = currentTip.icon

    const slideVariants = {
        enter: (dir: number) => ({
            x: dir > 0 ? 40 : -40,
            opacity: 0,
            scale: 0.96
        }),
        center: {
            x: 0,
            opacity: 1,
            scale: 1,
            transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
        },
        exit: (dir: number) => ({
            x: dir > 0 ? -40 : 40,
            opacity: 0,
            scale: 0.96,
            transition: { duration: 0.25 }
        })
    }

    return (
        <div
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            className={cn(
                "relative w-full rounded-2xl border overflow-hidden transition-all duration-300",
                "bg-gradient-to-br from-[#13151a] to-[#0d0e12]",
                "border-[hsl(var(--neon-lime)/0.25)] shadow-xl",
                className
            )}
        >
            {/* Top Glow Ambient Line */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--neon-lime)/0.6)] to-transparent" />

            <div className="p-4 md:p-5 space-y-4">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--neon-lime))]"></span>
                        </span>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                            Troubleshooting Tips
                        </h4>
                    </div>

                    {/* Floating Type Dots (Dynamic Indicator) */}
                    <div className="flex items-center gap-1.5">
                        {tips.map((tip, idx) => (
                            <button
                                key={tip.id}
                                onClick={() => handleDotClick(idx)}
                                aria-label={`Go to tip ${idx + 1}`}
                                className={cn(
                                    "h-2 rounded-full transition-all duration-300 outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--neon-lime))]",
                                    idx === currentIndex
                                        ? "w-6 bg-[hsl(var(--neon-lime))] shadow-[0_0_10px_hsl(var(--neon-lime)/0.8)]"
                                        : "w-2 bg-white/20 hover:bg-white/40"
                                )}
                            />
                        ))}
                    </div>
                </div>

                {/* Main Tip Slide View (1 Tip at Once) */}
                <div className="relative min-h-[90px] flex items-center">
                    <AnimatePresence custom={direction} mode="wait">
                        <motion.div
                            key={currentTip.id}
                            custom={direction}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="w-full flex items-start gap-3.5"
                        >
                            {/* Icon Box */}
                            <div className={cn(
                                "p-3 rounded-xl border shrink-0 transition-all",
                                "bg-[#1a1d24] border-white/10 shadow-md"
                            )}>
                                <IconComponent className={cn("h-5 w-5", currentTip.highlightColor)} />
                            </div>

                            {/* Text & Title */}
                            <div className="min-w-0 flex-1 space-y-1">
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

                {/* Bottom Navigation & Auto-scroll Progress Indicator */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px] text-gray-500">
                    <span className="flex items-center gap-1.5 font-medium">
                        <span className="text-[hsl(var(--neon-lime))] font-bold">{currentIndex + 1}</span> / {tips.length} Tips
                        {isPaused && (
                            <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20 ml-1">
                                Paused
                            </span>
                        )}
                    </span>

                    {/* Navigation Buttons */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handlePrev}
                            className="p-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            aria-label="Previous tip"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={handleNext}
                            className="p-1 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            aria-label="Next tip"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
