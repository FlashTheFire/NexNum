"use client"

import * as React from "react"
import { cn } from "@/lib/utils/utils"
import { HelpCircle } from "lucide-react"

interface TooltipProps {
    content: React.ReactNode
    children: React.ReactNode
    side?: "top" | "bottom" | "left" | "right"
    className?: string
}

export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
    const [isVisible, setIsVisible] = React.useState(false)
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return <>{children}</>

    const positions = {
        top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
        bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
        left: "right-full top-1/2 -translate-y-1/2 mr-2",
        right: "left-full top-1/2 -translate-y-1/2 ml-2",
    }

    const arrowPositions = {
        top: "top-full left-1/2 -translate-x-1/2 border-t-[#1e1e22] border-x-transparent border-b-transparent",
        bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-[#1e1e22] border-x-transparent border-t-transparent",
        left: "left-full top-1/2 -translate-y-1/2 border-l-[#1e1e22] border-y-transparent border-r-transparent",
        right: "right-full top-1/2 -translate-y-1/2 border-r-[#1e1e22] border-y-transparent border-l-transparent",
    }

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            {children}
            {isVisible && (
                <div
                    className={cn(
                        "absolute z-[9999] px-3 py-2 text-[11px] leading-relaxed rounded-xl bg-[#1e1e22] text-white/80 shadow-2xl border border-white/10",
                        "animate-in fade-in-0 zoom-in-95 duration-150",
                        "w-[280px] md:w-[320px]", // Fixed width - wider horizontally
                        positions[side],
                        className
                    )}
                >
                    {content}
                    <div
                        className={cn(
                            "absolute border-[6px]",
                            arrowPositions[side]
                        )}
                    />
                </div>
            )}
        </div>
    )
}

// Helper component for highlighted text in tooltips
export function TT({ children }: { children: React.ReactNode }) {
    return <span className="text-blue-400 font-medium">{children}</span>
}

// Helper for code/monospace text
export function TTCode({ children }: { children: React.ReactNode }) {
    return <code className="px-1 py-0.5 bg-white/10 rounded text-emerald-400 font-mono text-[10px]">{children}</code>
}

interface InfoTooltipProps {
    content: React.ReactNode
    side?: "top" | "bottom" | "left" | "right"
}

export function InfoTooltip({ content, side = "top" }: InfoTooltipProps) {
    return (
        <Tooltip content={content} side={side}>
            <button
                type="button"
                className="p-0.5 rounded-full text-white/30 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
                <HelpCircle className="w-3.5 h-3.5" />
            </button>
        </Tooltip>
    )
}
