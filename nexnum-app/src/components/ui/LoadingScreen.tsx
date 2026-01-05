"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { useEffect, useState } from "react"

interface LoadingScreenProps {
    status?: string
}

export default function LoadingScreen({ status = "Authenticating" }: LoadingScreenProps) {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    return (
        <div className="fixed inset-0 w-full h-full bg-[#030305] flex flex-col items-center justify-center z-[9999] overflow-hidden">
            {/* Cinematic Smooth Background Layers */}
            <div className="absolute inset-0 bg-[#030305]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(163,251,46,0.04)_0%,transparent_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(163,251,46,0.02)_0%,transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(0,255,255,0.02)_0%,transparent_50%)]" />

            {/* Ultra-subtle Noise Texture - Hidden on mobile to prevent lag */}
            <div className="hidden md:block absolute inset-0 opacity-[0.015] pointer-events-none mix-blend-overlay"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />

            <div className="relative flex flex-col items-center -translate-y-12 md:translate-y-0">
                {/* Brand Logo Cluster */}
                <div className="relative w-48 h-48 flex items-center justify-center mb-10 translate-y-4">

                    {/* 1. Deep Neon Bloom - Hidden on mobile to prevent lag */}
                    <motion.div
                        animate={{
                            opacity: [0.1, 0.25, 0.1],
                            scale: [1, 1.4, 1]
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="hidden md:block absolute w-80 h-80 bg-[hsl(var(--neon-lime))] rounded-full blur-[120px] pointer-events-none -z-10"
                    />

                    {/* 2. VIBRANT NEON OUTLINE (Layered & Tinted) */}
                    <motion.div
                        animate={{
                            scale: isMobile ? 1 : [1, 1.12, 1],
                            opacity: isMobile ? 0.6 : [0.5, 0.9, 0.5],
                        }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        className="absolute inset-0 z-0 flex items-center justify-center"
                    >
                        <div className="relative w-40 h-40">
                            <Image
                                src="/logos/nexnum-logo-outline.svg"
                                alt=""
                                fill
                                className="object-contain"
                                style={{
                                    filter: "invert(86%) sepia(43%) saturate(601%) hue-rotate(36deg) brightness(101%) contrast(98%) drop-shadow(0 0 12px hsl(var(--neon-lime)))"
                                }}
                                priority
                            />
                        </div>
                    </motion.div>

                    {/* 3. SOLID LOGO CORE (The Focus) */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                        }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="relative z-10 w-32 h-32"
                    >
                        <Image
                            src="/logos/nexnum-logo.svg"
                            alt="NexNum"
                            fill
                            className="object-contain drop-shadow-[0_15px_40px_rgba(0,0,0,0.95)]"
                            priority
                        />
                    </motion.div>
                </div>

                {/* Status UI Section (Balanced Position) */}
                <div className="flex flex-col items-center gap-6">
                    <motion.span
                        animate={{ opacity: [0.2, 0.4, 0.2] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="text-[9px] uppercase tracking-[0.6em] text-white/30 font-medium select-none"
                    >
                        {status}
                    </motion.span>

                    {/* High-End Precision Bar */}
                    <div className="relative w-48 h-[1px] bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            animate={{
                                left: ["-100%", "100%"]
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "linear"
                            }}
                            className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-[hsl(var(--neon-lime))] to-transparent blur-[1px]"
                        />
                    </div>
                </div>
            </div>

            {/* Minimal Decal Branding */}
            <div className="absolute bottom-16 flex flex-col items-center gap-4 opacity-30 select-none pointer-events-none">
                <span className="text-[8px] font-mono tracking-[0.8em] text-white/50 uppercase">
                    Protocol Secured
                </span>
            </div>
        </div>
    )
}
