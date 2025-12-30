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

    const layer1X = useTransform(smoothX, [-500, 500], [-15, 15]);
    const layer1Y = useTransform(smoothY, [-500, 500], [-15, 15]);
    const layer2X = useTransform(smoothX, [-500, 500], [-30, 30]);
    const layer2Y = useTransform(smoothY, [-500, 500], [-30, 30]);
    const layer3X = useTransform(smoothX, [-500, 500], [-50, 50]);
    const layer3Y = useTransform(smoothY, [-500, 500], [-50, 50]);

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
            {/* Ultra-premium gradient base */}
            <div
                className="absolute inset-0"
                style={{
                    background: `
                        radial-gradient(ellipse 120% 80% at 50% -30%, hsl(180,50%,10%) 0%, transparent 50%),
                        radial-gradient(ellipse 80% 60% at 90% 10%, hsl(75,100%,50%,0.08) 0%, transparent 35%),
                        radial-gradient(ellipse 60% 40% at 10% 90%, hsl(280,50%,15%,0.15) 0%, transparent 40%),
                        linear-gradient(180deg, #08080a 0%, #0a1414 40%, #0d1a1a 60%, #08080a 100%)
                    `
                }}
            />

            {/* Animated mesh gradient - Desktop only */}
            {!isMobile && !prefersReducedMotion && (
                <div className="absolute inset-0 opacity-30">
                    <motion.div
                        className="absolute w-[800px] h-[800px] -top-40 -right-40"
                        style={{ x: layer1X, y: layer1Y }}
                        animate={{
                            background: [
                                "radial-gradient(circle, hsl(75,100%,50%,0.15) 0%, transparent 50%)",
                                "radial-gradient(circle, hsl(75,100%,50%,0.1) 0%, transparent 60%)",
                                "radial-gradient(circle, hsl(75,100%,50%,0.15) 0%, transparent 50%)",
                            ]
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute w-[600px] h-[600px] -bottom-20 -left-20"
                        style={{ x: layer1X, y: layer1Y }}
                        animate={{
                            background: [
                                "radial-gradient(circle, hsl(180,50%,25%,0.12) 0%, transparent 50%)",
                                "radial-gradient(circle, hsl(180,50%,25%,0.08) 0%, transparent 60%)",
                                "radial-gradient(circle, hsl(180,50%,25%,0.12) 0%, transparent 50%)",
                            ]
                        }}
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    />
                </div>
            )}

            {/* Noise texture */}
            <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Vignette */}
            <div
                className="absolute inset-0"
                style={{ background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.6) 100%)" }}
            />

            {/* Desktop only: Floating 3D geometric shapes */}
            {!isMobile && !prefersReducedMotion && (
                <>
                    {/* Large rotating cube wireframe */}
                    <motion.div
                        className="absolute top-1/4 left-16 w-32 h-32"
                        style={{ x: layer2X, y: layer2Y, perspective: "1000px" }}
                    >
                        <motion.div
                            className="w-full h-full"
                            style={{ transformStyle: "preserve-3d" }}
                            animate={{ rotateX: 360, rotateY: 360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        >
                            {/* Cube faces as wireframes */}
                            <div className="absolute inset-0 border border-[hsl(var(--neon-lime)/0.15)] rounded-lg" style={{ transform: "translateZ(64px)" }} />
                            <div className="absolute inset-0 border border-[hsl(var(--neon-lime)/0.1)] rounded-lg" style={{ transform: "rotateY(90deg) translateZ(64px)" }} />
                            <div className="absolute inset-0 border border-[hsl(var(--neon-lime)/0.08)] rounded-lg" style={{ transform: "rotateX(90deg) translateZ(64px)" }} />
                        </motion.div>
                    </motion.div>

                    {/* Floating rings */}
                    <motion.div
                        className="absolute bottom-1/4 right-20 w-48 h-48"
                        style={{ x: layer3X, y: layer3Y }}
                    >
                        <motion.div
                            className="absolute inset-0 rounded-full border-2 border-[hsl(180,50%,50%,0.1)]"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                        />
                        <motion.div
                            className="absolute inset-4 rounded-full border border-[hsl(75,100%,50%,0.08)]"
                            animate={{ rotate: -360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        />
                        <motion.div
                            className="absolute inset-8 rounded-full border border-dashed border-[hsl(var(--neon-lime)/0.1)]"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                        />
                    </motion.div>

                    {/* Floating orbs with glow */}
                    <motion.div
                        className="absolute top-1/3 right-1/4 w-4 h-4"
                        style={{ x: layer2X, y: layer2Y }}
                    >
                        <motion.div
                            className="w-full h-full rounded-full bg-[hsl(var(--neon-lime))]"
                            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            style={{ boxShadow: "0 0 20px 5px hsl(75,100%,50%,0.3)" }}
                        />
                    </motion.div>

                    <motion.div
                        className="absolute top-2/3 left-1/4 w-3 h-3"
                        style={{ x: layer3X, y: layer3Y }}
                    >
                        <motion.div
                            className="w-full h-full rounded-full bg-[hsl(180,60%,50%)]"
                            animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.4, 0.2] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                            style={{ boxShadow: "0 0 15px 4px hsl(180,60%,50%,0.3)" }}
                        />
                    </motion.div>

                    <motion.div
                        className="absolute bottom-1/3 left-1/3 w-2 h-2"
                        animate={{ y: [0, -20, 0], opacity: [0.2, 0.4, 0.2] }}
                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    >
                        <div className="w-full h-full rounded-full bg-[hsl(280,60%,60%,0.4)]" style={{ boxShadow: "0 0 10px 3px hsl(280,60%,60%,0.2)" }} />
                    </motion.div>

                    {/* SVG connector lines */}
                    <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.04 }}>
                        <defs>
                            <linearGradient id="lineGradientAuth" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="hsl(75,100%,50%)" stopOpacity="0" />
                                <stop offset="50%" stopColor="hsl(75,100%,50%)" stopOpacity="1" />
                                <stop offset="100%" stopColor="hsl(75,100%,50%)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <motion.path
                            d="M 100 200 Q 400 100 700 300"
                            fill="none"
                            stroke="url(#lineGradientAuth)"
                            strokeWidth="1"
                            strokeDasharray="8 6"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 3, ease: "easeInOut" }}
                        />
                        <motion.path
                            d="M 600 100 Q 500 400 800 500"
                            fill="none"
                            stroke="url(#lineGradientAuth)"
                            strokeWidth="1"
                            strokeDasharray="6 8"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 4, ease: "easeInOut", delay: 0.5 }}
                        />
                    </svg>

                    {/* Particle dust - fixed positions to avoid hydration mismatch */}
                    <div className="absolute inset-0">
                        {[
                            { left: "15%", top: "20%", dur: 10, del: 0.5 },
                            { left: "25%", top: "35%", dur: 12, del: 1.2 },
                            { left: "40%", top: "15%", dur: 9, del: 0.8 },
                            { left: "55%", top: "45%", dur: 11, del: 2.1 },
                            { left: "70%", top: "25%", dur: 10, del: 0.3 },
                            { left: "85%", top: "60%", dur: 13, del: 1.8 },
                            { left: "20%", top: "70%", dur: 8, del: 2.5 },
                            { left: "35%", top: "55%", dur: 11, del: 0.9 },
                            { left: "50%", top: "80%", dur: 12, del: 1.5 },
                            { left: "65%", top: "40%", dur: 9, del: 2.8 },
                            { left: "80%", top: "30%", dur: 10, del: 0.6 },
                            { left: "45%", top: "65%", dur: 14, del: 1.1 },
                            { left: "30%", top: "85%", dur: 11, del: 2.3 },
                            { left: "75%", top: "75%", dur: 10, del: 3.2 },
                            { left: "60%", top: "12%", dur: 9, del: 1.7 },
                        ].map((p, i) => (
                            <motion.div
                                key={i}
                                className="absolute w-px h-px bg-white rounded-full"
                                style={{ left: p.left, top: p.top }}
                                animate={{
                                    y: [0, -30, 0],
                                    opacity: [0.1, 0.4, 0.1],
                                }}
                                transition={{
                                    duration: p.dur,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                    delay: p.del,
                                }}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* Grid lines - subtle */}
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
