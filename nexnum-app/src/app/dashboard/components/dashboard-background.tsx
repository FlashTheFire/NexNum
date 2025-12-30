"use client"

import { useEffect, useState, useMemo } from "react"
import { motion, useSpring, useTransform, useMotionValue } from "framer-motion"

// --- Professional Abstract Assets ---

const NoiseTexture = () => (
    <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none z-[10]"
        style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`
        }}
    />
)

const GridOverlay = () => (
    <div
        className="absolute inset-0 pointer-events-none opacity-[0.03] z-[1]"
        style={{
            backgroundImage: `linear-gradient(to right, #888 1px, transparent 1px),
                              linear-gradient(to bottom, #888 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
            maskImage: 'radial-gradient(circle at center, black, transparent 80%)'
        }}
    />
)

const GlowingOrb = ({ x, y, size, color, delay = 0 }: { x: string, y: string, size: string, color: string, delay?: number }) => (
    <motion.div
        className="absolute rounded-full blur-[100px]"
        style={{
            left: x,
            top: y,
            width: size,
            height: size,
            background: color
        }}
        animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
            x: [0, 30, 0],
            y: [0, -30, 0],
        }}
        transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay
        }}
    />
)

const ConnectionLine = () => (
    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.1] z-[2]">
        <motion.path
            d="M 100 600 C 300 400, 600 500, 900 200"
            fill="none"
            stroke="url(#gradient-line)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 4, ease: "easeOut" }}
        />
        <defs>
            <linearGradient id="gradient-line" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="50%" stopColor="white" />
                <stop offset="100%" stopColor="transparent" />
            </linearGradient>
        </defs>
    </svg>
)

// Replaced IsometricIsland with something more "Abstract & Professional"
const AbstractGlassShape = ({ delay = 0, x, y, scale = 1, rotation = 0 }: { delay?: number, x: string, y: string, scale?: number, rotation?: number }) => (
    <motion.div
        className="absolute pointer-events-none z-[5]"
        style={{ left: x, top: y }}
        animate={{ y: [0, -15, 0], rotate: [rotation, rotation + 3, rotation] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay }}
    >
        <div style={{ transform: `scale(${scale})` }} className="relative group perspective-1000">
            <div className="w-32 h-32 bg-gradient-to-tr from-white/[0.04] to-transparent border-t border-l border-white/[0.08] backdrop-blur-[2px] rounded-3xl transform rotate-12 shadow-2xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-white/[0.02] to-transparent" />
            </div>
            {/* Subtle Tech Accent */}
            <div className="absolute -bottom-4 -right-4 w-20 h-20 border-r border-b border-[hsl(var(--neon-lime)/0.15)] rounded-3xl transform rotate-12" />
        </div>
    </motion.div>
)

export function DashboardBackground() {
    const mouseX = useSpring(0, { stiffness: 40, damping: 30 })
    const mouseY = useSpring(0, { stiffness: 40, damping: 30 })

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const { clientX, clientY } = e
            const x = (clientX / window.innerWidth) - 0.5
            const y = (clientY / window.innerHeight) - 0.5
            mouseX.set(x)
            mouseY.set(y)
        }
        window.addEventListener("mousemove", handleMouseMove)
        return () => window.removeEventListener("mousemove", handleMouseMove)
    }, [mouseX, mouseY])

    const moveX = useTransform(mouseX, [-0.5, 0.5], [40, -40])
    const moveY = useTransform(mouseY, [-0.5, 0.5], [40, -40])

    return (
        <div className="fixed inset-0 z-0 bg-[#0a0a0c] overflow-hidden">
            {/* 1. Desktop: Deep Active Layer (HIDDEN ON MOBILE) */}
            <motion.div
                className="absolute inset-0 z-[0] hidden lg:block"
                style={{
                    background: useTransform(
                        [mouseX, mouseY],
                        ([x, y]: number[]) => `radial-gradient(circle at ${50 + x * 20}% ${50 + y * 20}%, #13151a 0%, #0a0a0c 60%)`
                    )
                }}
            />

            {/* 2. Desktop: Abstract Textures & Lighting (HIDDEN ON MOBILE) */}
            <div className="hidden lg:block">
                <GridOverlay />
                <NoiseTexture />

                {/* Volumetric Lighting (Orbs) - Desktop Only */}
                {/* Neon Lime Halo - Top Right */}
                <GlowingOrb x="70%" y="-20%" size="800px" color="radial-gradient(circle, rgba(204,255,0,0.04) 0%, transparent 70%)" />

                {/* Deep Slate/Teal - Bottom Left */}
                <GlowingOrb x="-10%" y="70%" size="700px" color="radial-gradient(circle, rgba(20,184,166,0.06) 0%, transparent 70%)" delay={2} />

                {/* Center Fill */}
                <GlowingOrb x="30%" y="30%" size="400px" color="rgba(255,255,255,0.015)" delay={1} />
            </div>

            {/* 3. Desktop: Abstract Floating Elements */}
            <motion.div className="absolute inset-0 z-[4] hidden lg:block" style={{ x: moveX, y: moveY }}>
                <ConnectionLine />
                <AbstractGlassShape x="8%" y="65%" scale={0.8} rotation={-12} delay={0} />
                <AbstractGlassShape x="4%" y="75%" scale={0.6} rotation={-8} delay={1.5} />
                <AbstractGlassShape x="88%" y="15%" scale={0.6} rotation={15} delay={2.5} />
            </motion.div>

            {/* 4. Mobile Optimized Background (Zero JS Animation, purely CSS) */}
            <div className="lg:hidden absolute inset-0 z-[0]">
                {/* Static high-performance gradient */}
                <div className="absolute inset-0 bg-[#0a0a0c]" />
                <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[60%] rounded-full bg-[hsl(var(--neon-lime)/0.04)] blur-[60px] pointer-events-none" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[40%] rounded-full bg-teal-900/10 blur-[60px] pointer-events-none" />

                {/* Very subtle static noise pattern for texture without heavy filter */}
                <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")` }} />
            </div>

            {/* 5. Shared Vignette (Static) */}
            <div className="absolute inset-0 pointer-events-none z-[20] shadow-[inset_0_0_120px_rgba(0,0,0,0.8)]" />
        </div>
    )
}
