"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

export default function AuthBackground() {
    const [isMobile, setIsMobile] = useState(false);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    // Mouse parallax for desktop
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const smoothX = useSpring(mouseX, { stiffness: 50, damping: 20 });
    const smoothY = useSpring(mouseY, { stiffness: 50, damping: 20 });

    // Parallax layers with different coefficients
    const layer1X = useTransform(smoothX, [-500, 500], [-15, 15]);
    const layer1Y = useTransform(smoothY, [-500, 500], [-15, 15]);
    const layer2X = useTransform(smoothX, [-500, 500], [-30, 30]);
    const layer2Y = useTransform(smoothY, [-500, 500], [-30, 30]);
    const layer3X = useTransform(smoothX, [-500, 500], [-60, 60]);
    const layer3Y = useTransform(smoothY, [-500, 500], [-60, 60]);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        const checkMotion = () => setPrefersReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

        checkMobile();
        checkMotion();
        window.addEventListener("resize", checkMobile);

        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    useEffect(() => {
        if (isMobile || prefersReducedMotion) return;

        const handleMouseMove = (e: MouseEvent) => {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            mouseX.set(e.clientX - centerX);
            mouseY.set(e.clientY - centerY);
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [isMobile, prefersReducedMotion, mouseX, mouseY]);

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
            {/* Base gradient */}
            <div
                className="absolute inset-0"
                style={{
                    background: `
                        radial-gradient(ellipse 80% 50% at 50% -20%, hsl(180,50%,12%) 0%, transparent 50%),
                        radial-gradient(ellipse 60% 40% at 85% 0%, hsl(75,100%,50%,0.08) 0%, transparent 40%),
                        linear-gradient(180deg, #0a0a0c 0%, #0d1f1f 50%, #0a0a0c 100%)
                    `
                }}
            />

            {/* Noise texture overlay */}
            <div
                className="absolute inset-0 opacity-[0.015]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Vignette */}
            <div
                className="absolute inset-0"
                style={{
                    background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)"
                }}
            />

            {/* Neon lime halo - top right */}
            <motion.div
                className="absolute -top-32 -right-32 w-[500px] h-[500px] lg:w-[700px] lg:h-[700px]"
                style={{
                    x: !isMobile && !prefersReducedMotion ? layer1X : 0,
                    y: !isMobile && !prefersReducedMotion ? layer1Y : 0,
                }}
            >
                <div
                    className="w-full h-full rounded-full animate-halo-pulse"
                    style={{
                        background: "radial-gradient(circle, hsl(75,100%,50%,0.12) 0%, hsl(75,100%,50%,0.04) 40%, transparent 70%)",
                        filter: "blur(60px)"
                    }}
                />
            </motion.div>

            {/* Secondary teal orb - bottom left */}
            <motion.div
                className="absolute -bottom-20 -left-20 w-[400px] h-[400px] lg:w-[500px] lg:h-[500px]"
                style={{
                    x: !isMobile && !prefersReducedMotion ? layer1X : 0,
                    y: !isMobile && !prefersReducedMotion ? layer1Y : 0,
                }}
            >
                <div
                    className="w-full h-full rounded-full"
                    style={{
                        background: "radial-gradient(circle, hsl(180,50%,20%,0.15) 0%, transparent 60%)",
                        filter: "blur(80px)"
                    }}
                />
            </motion.div>

            {/* Desktop only: Floating orbs */}
            {!isMobile && !prefersReducedMotion && (
                <>
                    {/* Orb 1 */}
                    <motion.div
                        className="absolute top-1/4 left-1/4 w-3 h-3 rounded-full bg-[hsl(75,100%,50%,0.3)]"
                        style={{
                            x: layer2X,
                            y: layer2Y,
                        }}
                        animate={{
                            y: [0, -20, 0],
                            opacity: [0.3, 0.6, 0.3],
                        }}
                        transition={{
                            duration: 8,
                            repeat: Infinity,
                            ease: "easeInOut",
                        }}
                    />

                    {/* Orb 2 */}
                    <motion.div
                        className="absolute top-1/3 right-1/3 w-2 h-2 rounded-full bg-[hsl(180,50%,50%,0.25)]"
                        style={{
                            x: layer3X,
                            y: layer3Y,
                        }}
                        animate={{
                            y: [0, 15, 0],
                            opacity: [0.25, 0.5, 0.25],
                        }}
                        transition={{
                            duration: 10,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 2,
                        }}
                    />

                    {/* Orb 3 */}
                    <motion.div
                        className="absolute bottom-1/3 left-1/3 w-4 h-4 rounded-full bg-[hsl(75,100%,50%,0.2)]"
                        style={{
                            x: layer2X,
                            y: layer2Y,
                        }}
                        animate={{
                            y: [0, -25, 0],
                            x: [0, 10, 0],
                            opacity: [0.2, 0.4, 0.2],
                        }}
                        transition={{
                            duration: 12,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 4,
                        }}
                    />

                    {/* Orb 4 */}
                    <motion.div
                        className="absolute top-2/3 right-1/4 w-2.5 h-2.5 rounded-full bg-[hsl(75,100%,60%,0.15)]"
                        animate={{
                            y: [0, 18, 0],
                            opacity: [0.15, 0.35, 0.15],
                        }}
                        transition={{
                            duration: 9,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 1,
                        }}
                    />
                </>
            )}

            {/* Desktop only: SVG connector lines */}
            {!isMobile && !prefersReducedMotion && (
                <svg
                    className="absolute inset-0 w-full h-full"
                    style={{ opacity: 0.06 }}
                >
                    <defs>
                        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="hsl(75,100%,50%)" stopOpacity="0" />
                            <stop offset="50%" stopColor="hsl(75,100%,50%)" stopOpacity="1" />
                            <stop offset="100%" stopColor="hsl(75,100%,50%)" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* Curved connector 1 */}
                    <motion.path
                        d="M 100 200 Q 300 100 500 250"
                        fill="none"
                        stroke="url(#lineGradient)"
                        strokeWidth="1"
                        strokeDasharray="8 4"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 2, ease: "easeInOut" }}
                    />

                    {/* Curved connector 2 */}
                    <motion.path
                        d="M 800 100 Q 600 300 900 400"
                        fill="none"
                        stroke="url(#lineGradient)"
                        strokeWidth="1"
                        strokeDasharray="6 6"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 2.5, ease: "easeInOut", delay: 0.5 }}
                    />
                </svg>
            )}

            {/* Desktop only: Particle dust */}
            {!isMobile && !prefersReducedMotion && (
                <div className="absolute inset-0">
                    {Array.from({ length: 20 }).map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute w-px h-px bg-white rounded-full"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                opacity: 0.1 + Math.random() * 0.2,
                            }}
                            animate={{
                                y: [0, -30, 0],
                                opacity: [0.1, 0.3, 0.1],
                            }}
                            transition={{
                                duration: 10 + Math.random() * 8,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: Math.random() * 5,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Grid lines - subtle texture */}
            <div
                className="absolute inset-0 hidden lg:block"
                style={{
                    backgroundImage: `
                        linear-gradient(90deg, hsl(75,100%,50%,0.02) 1px, transparent 1px),
                        linear-gradient(hsl(75,100%,50%,0.02) 1px, transparent 1px)
                    `,
                    backgroundSize: "100px 100px",
                    opacity: 0.5,
                }}
            />
        </div>
    );
}
