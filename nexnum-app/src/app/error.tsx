"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"
import { RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

// Note: This root-level error page cannot use next-intl hooks
// because it's outside the [locale] segment and has no i18n provider context.
// For localized error pages, use src/app/[locale]/error.tsx instead.

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    const logoSize = "w-24 h-24"

    return (
        <div className="fixed inset-0 w-full h-full bg-[#030305] flex flex-col items-center justify-center z-[9999] overflow-hidden selection:bg-red-500/30 selection:text-white">
            <div className="absolute inset-0 bg-[#030305]" />

            {/* Singular Warm Glow for Exception State */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(255,80,40,0.04)_0%,transparent_70%)] pointer-events-none" />

            <div className="relative flex flex-col items-center max-w-lg px-6 text-center z-10 w-full">

                {/* Brand Hero Cluster (Perfectly Layered Brand - Exception Variant) */}
                <div className="relative w-32 h-32 flex items-center justify-center mb-16">
                    {/* Layer 1: Alert Aura */}
                    <div className="absolute w-44 h-44 bg-red-600/20 rounded-full blur-[70px] -z-10" />

                    {/* Layer 2: SMALL RED NEON OUTLINE (Stroke Effect) */}
                    <div className={`absolute ${logoSize} flex items-center justify-center pointer-events-none z-0 scale-[1.02]`}>
                        <div
                            className="relative w-full h-full bg-red-500 shadow-[0_0_10px_rgba(255,50,50,0.3)]"
                            style={{
                                WebkitMaskImage: 'url("/logos/nexnum-logo-outline.svg")',
                                maskImage: 'url("/logos/nexnum-logo-outline.svg")',
                                WebkitMaskRepeat: 'no-repeat',
                                maskRepeat: 'no-repeat',
                                WebkitMaskPosition: 'center',
                                maskPosition: 'center',
                                WebkitMaskSize: 'contain',
                                maskSize: 'contain'
                            }}
                        />
                    </div>

                    {/* Layer 3: Solid Brand Identity Core (White Contrast) */}
                    <div className={`relative ${logoSize} flex items-center justify-center pointer-events-none z-10`}>
                        <div
                            className="relative w-full h-full bg-white shadow-[0_5px_15px_rgba(0,0,0,0.5)]"
                            style={{
                                WebkitMaskImage: 'url("/logos/nexnum-logo.svg")',
                                maskImage: 'url("/logos/nexnum-logo.svg")',
                                WebkitMaskRepeat: 'no-repeat',
                                maskRepeat: 'no-repeat',
                                WebkitMaskPosition: 'center',
                                maskPosition: 'center',
                                WebkitMaskSize: 'contain',
                                maskSize: 'contain'
                            }}
                        />
                    </div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="flex flex-col items-center w-full"
                >
                    <div className="flex items-center gap-4 mb-6">
                        <div className="h-px w-6 bg-red-500/20" />
                        <span className="text-[10px] font-mono font-medium text-red-500/80 tracking-[0.5em] uppercase">
                            System Error
                        </span>
                        <div className="h-px w-6 bg-red-500/20" />
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-wide md:whitespace-nowrap">
                        Something Went Wrong
                    </h1>

                    <p className="text-gray-500 text-sm leading-relaxed mb-12 max-w-xs mx-auto font-light tracking-wide">
                        An unexpected error occurred. Please try again.
                    </p>

                    {error.digest && (
                        <div className="mb-12">
                            <code className="text-[9px] font-mono text-white/20 select-all tracking-tight bg-red-500/5 px-4 py-2 rounded-full border border-red-500/10">
                                Error Code: {error.digest}
                            </code>
                        </div>
                    )}

                    <Button
                        onClick={() => reset()}
                        className="h-12 px-10 rounded-full bg-white text-black font-semibold text-xs tracking-widest uppercase hover:bg-red-500 hover:text-white transition-all duration-300 shadow-2xl shadow-red-500/10 group border-none"
                    >
                        <span className="flex items-center gap-2">
                            <RefreshCcw className="h-3.5 w-3.5 group-hover:rotate-180 transition-transform duration-700" />
                            Try Again
                        </span>
                    </Button>
                </motion.div>
            </div>
        </div>
    )
}
