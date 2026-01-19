"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

export default function NotFound() {
    const t = useTranslations('ErrorPages.notFound')
    const logoSize = "w-24 h-24"

    return (
        <div className="fixed inset-0 w-full h-full bg-[#030305] flex flex-col items-center justify-center z-[9999] overflow-hidden selection:bg-[hsl(var(--neon-lime))] selection:text-black">
            {/* Cinematic Background */}
            <div className="absolute inset-0 bg-[#030305]" />

            {/* Soft Ambient Light Center */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(163,251,46,0.06)_0%,transparent_70%)] pointer-events-none" />

            {/* Subtle Noise Grain */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />

            <div className="relative flex flex-col items-center max-w-lg px-6 text-center z-10 w-full">

                {/* Brand Hero Cluster (Subtle Neon Outline Fix) */}
                <div className="relative w-32 h-32 flex items-center justify-center mb-16">

                    {/* Layer 1: Radiant Glow Backlight (Subtle) */}
                    <div className="absolute w-40 h-40 bg-[hsl(var(--neon-lime))] rounded-full blur-[70px] opacity-15 -z-10" />

                    {/* Layer 2: SMALL NEON OUTLINE (Border Effect) */}
                    <div className={`absolute ${logoSize} flex items-center justify-center pointer-events-none z-0 scale-[1.02]`}>
                        <div
                            className="relative w-full h-full bg-[hsl(var(--neon-lime))] shadow-[0_0_10px_hsl(var(--neon-lime)/0.3)]"
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

                {/* Information Layer */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="flex flex-col items-center w-full"
                >
                    <h1 className="text-6xl font-bold text-white mb-4 tracking-tighter">
                        {t('title')}
                    </h1>

                    <div className="flex items-center gap-4 mb-8">
                        <div className="h-px w-6 bg-white/10" />
                        <span className="text-[10px] font-mono font-medium text-[hsl(var(--neon-lime))/0.8] tracking-[0.5em] uppercase">
                            {t('subtitle')}
                        </span>
                        <div className="h-px w-6 bg-white/10" />
                    </div>

                    <p className="text-gray-500 text-sm leading-relaxed mb-12 max-w-xs mx-auto font-light tracking-wide">
                        {t('description')}
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-6 w-full justify-center">
                        <Link href="/dashboard" className="w-full sm:w-auto">
                            <Button className="h-12 w-full sm:w-auto px-10 rounded-full bg-white text-black font-semibold text-xs tracking-widest uppercase hover:bg-[hsl(var(--neon-lime))] transition-all duration-300 group shadow-2xl shadow-white/5 border-none">
                                <span className="flex items-center gap-2">
                                    {t('returnButton')}
                                    <ArrowLeft className="w-3.5 h-3.5 rotate-180 group-hover:translate-x-1 transition-transform" />
                                </span>
                            </Button>
                        </Link>

                        <Link href="/" className="text-[10px] font-mono text-white/30 hover:text-[hsl(var(--neon-lime))] tracking-[0.3em] uppercase transition-colors duration-300 py-2">
                            {t('homeLink')}
                        </Link>
                    </div>
                </motion.div>
            </div>

            {/* Signature Decal */}
            <div className="absolute bottom-12 flex flex-col items-center gap-3 opacity-10 select-none z-10 grayscale">
                <span className="text-[8px] font-mono tracking-[0.8em] text-white/50 uppercase">
                    {t('footer')}
                </span>
            </div>
        </div>
    )
}

