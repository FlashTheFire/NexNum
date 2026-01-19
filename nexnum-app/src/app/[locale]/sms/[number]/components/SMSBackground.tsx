"use client"

import { useEffect, useRef, memo } from 'react'

/**
 * Premium SMS Background Component
 * - Dark charcoal base with layered radial gradients
 * - Neon-lime halo (top-right, pulsing)
 * - Micro-islands (lower-left isometric nodes)
 * - Floating glassmorphism panels
 * - Particle dust field
 * - Parallax response to pointer (desktop only)
 * - Reduced motion fallback
 */
export const SMSBackground = memo(function SMSBackground() {
    const containerRef = useRef<HTMLDivElement>(null)

    // Parallax effect on desktop
    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (prefersReducedMotion) return

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current || window.innerWidth < 1024) return

            const { clientX, clientY } = e
            const x = (clientX / window.innerWidth - 0.5) * 2
            const y = (clientY / window.innerHeight - 0.5) * 2

            const layers = containerRef.current.querySelectorAll<HTMLElement>('[data-parallax]')
            layers.forEach(layer => {
                const depth = parseFloat(layer.dataset.parallax || '0')
                const moveX = x * depth * 30
                const moveY = y * depth * 30
                layer.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`
            })
        }

        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    return (
        <div ref={containerRef} className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {/* Base gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0c10] via-[#0f1115] to-[#14171d]" />

            {/* Micro-noise texture */}
            <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
                }}
            />

            {/* Top-right neon-lime halo */}
            <div
                data-parallax="0.03"
                className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full animate-halo-pulse"
                style={{
                    background: 'radial-gradient(circle, rgba(179,255,0,0.12) 0%, rgba(179,255,0,0.04) 40%, transparent 70%)'
                }}
            />

            {/* Secondary halo (lower intensity) */}
            <div
                data-parallax="0.06"
                className="absolute top-1/4 right-1/4 w-[300px] h-[300px] rounded-full opacity-50"
                style={{
                    background: 'radial-gradient(circle, rgba(0,255,200,0.08) 0%, transparent 60%)'
                }}
            />

            {/* Lower-left micro-islands (isometric server nodes) */}
            <div
                data-parallax="0.12"
                className="absolute bottom-20 left-10 md:bottom-32 md:left-20 opacity-[0.15] animate-island-float"
            >
                {/* Isometric node 1 */}
                <div className="relative w-16 h-16 md:w-24 md:h-24">
                    <div
                        className="absolute inset-0 bg-gradient-to-br from-[#1a1d24] to-[#0f1115] rounded-lg border border-[hsl(var(--neon-lime)/0.2)]"
                        style={{ transform: 'rotateX(60deg) rotateZ(-45deg)' }}
                    />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 rounded bg-[hsl(var(--neon-lime)/0.3)]" />
                </div>
            </div>

            {/* Micro-island node 2 */}
            <div
                data-parallax="0.08"
                className="absolute bottom-40 left-32 md:bottom-48 md:left-48 opacity-[0.12] animate-island-float-delayed"
            >
                <div className="relative w-12 h-12 md:w-16 md:h-16">
                    <div
                        className="absolute inset-0 bg-gradient-to-br from-[#1a1d24] to-[#0f1115] rounded border border-cyan-500/20"
                        style={{ transform: 'rotateX(60deg) rotateZ(-45deg)' }}
                    />
                </div>
            </div>

            {/* Glassmorphism floating panels */}
            <div
                data-parallax="0.06"
                className="hidden lg:block absolute top-1/3 right-[15%] w-48 h-32 rounded-2xl bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] shadow-2xl animate-panel-float"
            />
            <div
                data-parallax="0.09"
                className="hidden lg:block absolute top-[45%] right-[12%] w-40 h-28 rounded-2xl bg-white/[0.015] backdrop-blur-sm border border-white/[0.03] shadow-xl animate-panel-float-delayed"
            />

            {/* Data grid texture (top-left) */}
            <div
                className="absolute top-0 left-0 w-64 h-64 opacity-[0.06]"
                style={{
                    backgroundImage: `
                        linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: '24px 24px'
                }}
            />

            {/* Dashed connector lines */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.08]" data-parallax="0.04">
                <defs>
                    <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(179,255,0,0.4)" />
                        <stop offset="100%" stopColor="rgba(0,255,200,0.2)" />
                    </linearGradient>
                </defs>
                {/* Connector from top-right to center */}
                <path
                    d="M 80% 20% Q 60% 30% 55% 50%"
                    fill="none"
                    stroke="url(#lineGradient)"
                    strokeWidth="1"
                    strokeDasharray="8 6"
                    className="animate-connector-draw"
                />
                {/* Connector from bottom-left to center */}
                <path
                    d="M 15% 75% Q 30% 60% 45% 55%"
                    fill="none"
                    stroke="url(#lineGradient)"
                    strokeWidth="1"
                    strokeDasharray="6 8"
                    className="animate-connector-draw-delayed"
                />
            </svg>

            {/* Particle dust field */}
            <div className="absolute inset-0">
                {[...Array(8)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-1 h-1 rounded-full bg-white/20 animate-particle-drift"
                        style={{
                            left: `${15 + i * 10}%`,
                            top: `${20 + (i % 3) * 25}%`,
                            animationDelay: `${i * 1.5}s`,
                            animationDuration: `${12 + i * 2}s`
                        }}
                    />
                ))}
            </div>

            {/* Concentric pulsing circles */}
            <div
                data-parallax="0.05"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 opacity-[0.04]"
            >
                <div className="absolute inset-0 rounded-full border border-white/20 animate-concentric-pulse" />
                <div className="absolute inset-8 rounded-full border border-white/15 animate-concentric-pulse-delayed" />
                <div className="absolute inset-16 rounded-full border border-white/10 animate-concentric-pulse-more-delayed" />
            </div>

            {/* Vignette overlay */}
            <div
                className="absolute inset-0"
                style={{
                    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)'
                }}
            />

            {/* Animation keyframes in style tag */}
            <style jsx>{`
                @keyframes halo-pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.05); }
                }
                @keyframes island-float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                }
                @keyframes panel-float {
                    0%, 100% { transform: translateY(0px) rotate(1deg); }
                    50% { transform: translateY(-12px) rotate(-1deg); }
                }
                @keyframes particle-drift {
                    0% { opacity: 0; transform: translate(0, 0); }
                    20% { opacity: 0.4; }
                    80% { opacity: 0.4; }
                    100% { opacity: 0; transform: translate(50px, -30px); }
                }
                @keyframes concentric-pulse {
                    0%, 100% { transform: scale(1); opacity: 0.04; }
                    50% { transform: scale(1.1); opacity: 0.02; }
                }
                @keyframes connector-draw {
                    0% { stroke-dashoffset: 100; }
                    100% { stroke-dashoffset: 0; }
                }
                .animate-halo-pulse { animation: halo-pulse 4s ease-in-out infinite; }
                .animate-island-float { animation: island-float 10s ease-in-out infinite; }
                .animate-island-float-delayed { animation: island-float 8s ease-in-out infinite 2s; }
                .animate-panel-float { animation: panel-float 8s ease-in-out infinite; }
                .animate-panel-float-delayed { animation: panel-float 10s ease-in-out infinite 1.5s; }
                .animate-particle-drift { animation: particle-drift 14s ease-in-out infinite; }
                .animate-concentric-pulse { animation: concentric-pulse 5s ease-in-out infinite; }
                .animate-concentric-pulse-delayed { animation: concentric-pulse 5s ease-in-out infinite 0.5s; }
                .animate-concentric-pulse-more-delayed { animation: concentric-pulse 5s ease-in-out infinite 1s; }
                .animate-connector-draw { animation: connector-draw 0.8s ease-out forwards; }
                .animate-connector-draw-delayed { animation: connector-draw 0.6s ease-out 0.3s forwards; stroke-dashoffset: 100; }
                
                @media (prefers-reduced-motion: reduce) {
                    .animate-halo-pulse,
                    .animate-island-float,
                    .animate-island-float-delayed,
                    .animate-panel-float,
                    .animate-panel-float-delayed,
                    .animate-particle-drift,
                    .animate-concentric-pulse,
                    .animate-concentric-pulse-delayed,
                    .animate-concentric-pulse-more-delayed,
                    .animate-connector-draw,
                    .animate-connector-draw-delayed {
                        animation: none !important;
                    }
                }
            `}</style>
        </div>
    )
})
