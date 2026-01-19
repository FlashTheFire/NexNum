"use client"

import { motion } from "framer-motion"
import { Lock, Clock, Terminal, Activity } from "lucide-react"

import { TechnicalHUD } from "@/components/ui/technical-hud"
import { useTranslations } from "next-intl"

export default function MaintenancePage() {
    const t = useTranslations('ErrorPages.maintenance')
    const logoSize = "w-24 h-24"

    return (
        <div className="fixed inset-0 w-full h-full bg-[#030305] flex flex-col items-center justify-center z-[9999] overflow-hidden selection:bg-[hsl(var(--neon-lime))] selection:text-black font-sans">

            {/* Absolute Black Canvas */}
            <div className="absolute inset-0 bg-[#030305]" />

            {/* MOBILE ONLY: Soft Ambient Background (Matches Error/404) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(163,251,46,0.06)_0%,transparent_70%)] pointer-events-none md:hidden" />
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay md:hidden"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />

            {/* DESKTOP ONLY: Cinematic Ultra-High-Fidelity HUD */}
            <div className="hidden md:block absolute inset-0">
                <TechnicalHUD />
            </div>

            <div className="relative flex flex-col items-center max-w-4xl px-6 text-center z-10 w-full">

                {/* Mobile: Standard Status Rail | Desktop: Terminal Badge */}
                <div className="mb-12 md:mb-20">
                    <div className="md:hidden flex items-center gap-4">
                        <div className="h-px w-6 bg-white/10" />
                        <span className="text-[10px] font-mono font-medium text-[hsl(var(--neon-lime))/0.8] tracking-[0.5em] uppercase">
                            {t('badge')}
                        </span>
                        <div className="h-px w-6 bg-white/10" />
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 0.5, y: 0 }}
                        className="hidden md:flex items-center gap-2 font-mono text-[9px] tracking-[0.5em] text-[hsl(var(--neon-lime))] border border-[hsl(var(--neon-lime))/0.15] px-6 py-2 rounded-full bg-[hsl(var(--neon-lime))/0.03] backdrop-blur-md shadow-[0_0_20px_rgba(163,251,46,0.05)]"
                    >
                        <div className="w-1.5 h-1.5 bg-[hsl(var(--neon-lime))] rounded-full animate-pulse shadow-[0_0_10px_hsl(var(--neon-lime))]" />
                        SYSCORP_MAINTENANCE_ID_AX-9042
                    </motion.div>
                </div>

                {/* 3. Brand Hero (The Core Identity) */}
                <div className="relative w-32 h-32 flex items-center justify-center mb-12 md:mb-16">
                    {/* Mobile Glow */}
                    <div className="absolute w-40 h-40 bg-[hsl(var(--neon-lime))] rounded-full blur-[70px] opacity-15 -z-10 md:hidden" />

                    {/* Desktop Glow */}
                    <div className="hidden md:block absolute bottom-0 w-32 h-2 bg-[hsl(var(--neon-lime))] blur-[30px] opacity-50" />

                    <div className={`absolute ${logoSize} flex items-center justify-center pointer-events-none z-0 scale-[1.03]`}>
                        <div
                            className="relative w-full h-full bg-[hsl(var(--neon-lime))] shadow-[0_0_10px_hsl(var(--neon-lime)/0.3)] md:shadow-[0_0_40px_hsl(var(--neon-lime)/0.4)]"
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
                    <div className={`relative z-10 ${logoSize} flex items-center justify-center pointer-events-none drop-shadow-[0_0_30px_rgba(0,0,0,1)]`}>
                        <div
                            className="relative w-full h-full bg-white"
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

                {/* 4. Headline & Context */}
                <motion.h1
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-5xl md:text-8xl font-bold md:font-black text-white mb-6 md:mb-8 tracking-wide md:tracking-tighter md:italic drop-shadow-2xl md:drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] md:whitespace-nowrap"
                >
                    {t('title')}
                </motion.h1>

                <p className="text-gray-500 text-sm md:text-xs leading-relaxed mb-12 md:mb-24 font-light tracking-wide md:tracking-[0.4em] max-w-xs md:max-w-xl mx-auto opacity-80 md:opacity-50 md:uppercase font-sans md:font-mono md:italic">
                    {t('description')}
                </p>



            </div>

            {/* 6. TECHNICAL FOOTER (Desktop Only) / Signature (Mobile) */}
            <div className="absolute bottom-12 flex flex-col items-center gap-4 opacity-10 select-none grayscale w-full">
                <div className="hidden md:flex items-center gap-8 text-[7px] font-mono text-white uppercase tracking-[0.5em]">
                    <span>CPU_LOAD: 12.4%</span>
                    <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-white to-transparent" />
                    <span>MEMORY_CACHE: OPTIMIZED</span>
                </div>
                <div className="md:hidden text-[8px] font-mono tracking-[0.8em] text-white uppercase">
                    {t('footer')}
                </div>
                <span className="hidden md:block text-[8px] font-mono text-white uppercase tracking-[1.5em] font-bold">NEXNUM_INFRASTRUCTURE_V2.1</span>
            </div>
        </div>
    )
}

