"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function VerifyEmailBackground() {
    const [isMobile, setIsMobile] = useState(false);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        const checkMotion = () =>
            setPrefersReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        checkMobile();
        checkMotion();
        
        // Trigger visibility for animations
        setIsVisible(true);
        
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
            {/* Hero-style gradient base */}
            <div
                className="absolute inset-0"
                style={{
                    background: `
                        radial-gradient(ellipse 120% 80% at 50% -30%, hsl(180,50%,10%) 0%, transparent 50%),
                        radial-gradient(ellipse 80% 60% at 90% 10%, hsl(75,100%,50%,0.08) 0%, transparent 35%),
                        radial-gradient(ellipse 60% 40% at 10% 90%, hsl(280,50%,15%,0.15) 0%, transparent 40%),
                        linear-gradient(180deg, #08080a 0%, #0a1414 40%, #0d1a1a 60%, #08080a 100%)
                    `,
                }}
            />

            {/* Animated mesh gradient - Desktop only */}
            {!isMobile && !prefersReducedMotion && (
                <div className="absolute inset-0 opacity-40">
                    <motion.div
                        className="absolute w-[800px] h-[800px] -top-40 -right-40"
                        animate={{
                            background: [
                                "radial-gradient(circle, hsl(75,100%,50%,0.15) 0%, transparent 50%)",
                                "radial-gradient(circle, hsl(75,100%,50%,0.1) 0%, transparent 60%)",
                                "radial-gradient(circle, hsl(75,100%,50%,0.15) 0%, transparent 50%)",
                            ],
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute w-[600px] h-[600px] -bottom-20 -left-20"
                        animate={{
                            background: [
                                "radial-gradient(circle, hsl(180,50%,25%,0.12) 0%, transparent 50%)",
                                "radial-gradient(circle, hsl(180,50%,25%,0.08) 0%, transparent 60%)",
                                "radial-gradient(circle, hsl(180,50%,25%,0.12) 0%, transparent 50%)",
                            ],
                        }}
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    />
                </div>
            )}

            {/* Bokeh light orbs */}
            {!isMobile && !prefersReducedMotion && (
                <>
                    <motion.div
                        className="absolute top-20 left-[15%] w-32 h-32 rounded-full bg-[hsl(var(--neon-lime)/0.1)] blur-3xl"
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute bottom-32 left-[25%] w-24 h-24 rounded-full bg-teal-500/10 blur-2xl"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
                        transition={{
                            duration: 5,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 1,
                        }}
                    />
                    <motion.div
                        className="absolute top-1/3 right-[5%] w-40 h-40 rounded-full bg-[hsl(var(--neon-lime)/0.05)] blur-3xl"
                        animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.35, 0.15] }}
                        transition={{
                            duration: 6,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 2,
                        }}
                    />
                </>
            )}

            {/* Spotlight glow effect */}
            <div
                className="absolute inset-0 spotlight pointer-events-none"
                style={{
                    background:
                        "radial-gradient(circle at 50% 20%, rgba(188,255,0,0.08) 0%, transparent 50%)",
                }}
            />

            {/* Noise texture */}
            <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Vignette edge fade */}
            <div
                className="absolute inset-0"
                style={{
                    background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.6) 100%)",
                }}
            />

            {/* Grid lines - subtle and mobile-hidden */}
            <div
                className="absolute inset-0 hidden lg:block"
                style={{
                    backgroundImage: `
                        linear-gradient(90deg, hsl(75,100%,50%,0.015) 1px, transparent 1px),
                        linear-gradient(hsl(75,100%,50%,0.015) 1px, transparent 1px)
                    `,
                    backgroundSize: "80px 80px",
                }}
            />
        </div>
    );
}
