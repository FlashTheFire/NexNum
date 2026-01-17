"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"

// Detect if device is mobile or prefers reduced motion
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
            const isSmallScreen = window.innerWidth < 768
            setIsMobile(prefersReducedMotion || isTouchDevice || isSmallScreen)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    return isMobile
}

export const DashboardBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const isMobile = useIsMobile()

    // Only run particle animation on desktop
    useEffect(() => {
        if (isMobile) return // Skip particles on mobile for performance

        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let width = canvas.width = window.innerWidth
        let height = canvas.height = window.innerHeight

        // Fewer particles for better performance
        const particleCount = Math.min(25, Math.floor(width / 50))
        const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = []

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.15,
                vy: (Math.random() - 0.5) * 0.15,
                size: Math.random() * 1.5 + 0.5,
                alpha: Math.random() * 0.2 + 0.1,
            })
        }

        const resize = () => {
            width = canvas.width = window.innerWidth
            height = canvas.height = window.innerHeight
        }
        window.addEventListener('resize', resize)

        let active = true
        let lastTime = 0
        const fps = 30 // Cap at 30fps for performance
        const interval = 1000 / fps

        const animate = (currentTime: number) => {
            if (!active) return

            const delta = currentTime - lastTime
            if (delta < interval) {
                requestAnimationFrame(animate)
                return
            }
            lastTime = currentTime - (delta % interval)

            ctx.clearRect(0, 0, width, height)

            particles.forEach(p => {
                p.x += p.vx
                p.y += p.vy

                if (p.x < 0) p.x = width
                if (p.x > width) p.x = 0
                if (p.y < 0) p.y = height
                if (p.y > height) p.y = 0

                ctx.beginPath()
                ctx.fillStyle = `rgba(179, 255, 0, ${p.alpha})`
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
                ctx.fill()
            })

            requestAnimationFrame(animate)
        }
        requestAnimationFrame(animate)

        return () => {
            active = false
            window.removeEventListener('resize', resize)
        }
    }, [isMobile])

    return (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#0a0a0c]">
            {/* Base Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0c] via-[#0d1216] to-[#0a0f12]" />

            {/* Neon Halo - CSS only, GPU accelerated */}
            <div
                className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] md:w-[800px] md:h-[800px] rounded-full opacity-[0.05] will-change-transform"
                style={{
                    background: 'radial-gradient(circle, rgba(179,255,0,0.3) 0%, transparent 70%)',
                    filter: 'blur(80px)'
                }}
            />

            {/* Secondary Glow */}
            <div
                className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px] rounded-full opacity-[0.03]"
                style={{
                    background: 'radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%)',
                    filter: 'blur(60px)'
                }}
            />

            {/* Grid - Static, no animation */}
            <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Particles Canvas - Only rendered on desktop */}
            {!isMobile && <canvas ref={canvasRef} className="absolute inset-0 z-10" />}

            {/* Vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(10,10,12,0.5)_100%)] z-20" />
        </div>
    )
}
