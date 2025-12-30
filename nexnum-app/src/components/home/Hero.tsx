"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Zap, Battery, Wifi, Signal } from "lucide-react";
import FloatingAppIcon from "./FloatingAppIcon";
import { useState, useEffect } from "react";

// Hook for real-time clock
function useRealTime() {
    const [time, setTime] = useState<string>("");

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            let hours = now.getHours();
            const minutes = now.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // 12-hour format
            const timeStr = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
            setTime(timeStr);
        };

        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    return time;
}

// Hook for battery status
function useBatteryStatus() {
    const [battery, setBattery] = useState({ level: 85, charging: false });

    useEffect(() => {
        const getBattery = async () => {
            try {
                // @ts-ignore - Battery API
                if (navigator.getBattery) {
                    // @ts-ignore
                    const bat = await navigator.getBattery();
                    setBattery({ level: Math.round(bat.level * 100), charging: bat.charging });

                    bat.addEventListener('levelchange', () => {
                        setBattery(prev => ({ ...prev, level: Math.round(bat.level * 100) }));
                    });
                    bat.addEventListener('chargingchange', () => {
                        setBattery(prev => ({ ...prev, charging: bat.charging }));
                    });
                }
            } catch (e) {
                // Fallback - use random realistic value
                setBattery({ level: 78, charging: false });
            }
        };
        getBattery();
    }, []);

    return battery;
}

export default function Hero() {
    const currentTime = useRealTime();
    const battery = useBatteryStatus();

    return (
        <section className="relative min-h-screen overflow-hidden hero-gradient film-grain vignette">
            {/* Spotlight glow behind phone */}
            <div className="absolute inset-0 spotlight pointer-events-none" />

            {/* Bokeh light orbs */}
            <div className="absolute top-20 left-[15%] w-32 h-32 rounded-full bg-[hsl(var(--neon-lime)/0.1)] blur-3xl bokeh" />
            <div className="absolute bottom-32 left-[25%] w-24 h-24 rounded-full bg-teal-500/10 blur-2xl bokeh" style={{ animationDelay: "1s" }} />
            <div className="absolute top-1/3 right-[5%] w-40 h-40 rounded-full bg-[hsl(var(--neon-lime)/0.05)] blur-3xl bokeh" style={{ animationDelay: "2s" }} />

            {/* Neon lime ring accent - top right */}
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full border-2 border-[hsl(var(--neon-lime)/0.2)] opacity-50" />
            <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full border border-[hsl(var(--neon-lime)/0.1)]" />

            <div className="container mx-auto px-4 pt-8 pb-8 md:pt-28 md:pb-32 relative z-10">
                {/* Mobile layout: Headline ABOVE phone */}
                <div className="lg:hidden text-center mb-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Main headline - Mobile */}
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-[1.15]">
                            <span className="text-white">Secure SMS</span>{" "}
                            <span className="text-[hsl(var(--neon-lime))] neon-text-glow">Verification</span>
                        </h1>
                    </motion.div>
                </div>

                <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-8">
                    {/* Left side - Content (DESKTOP ONLY) */}
                    <div className="hidden lg:block flex-1 text-left lg:pr-8 max-w-2xl">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            {/* Status badge - Desktop */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="inline-flex items-center px-4 py-2 rounded-full border border-[hsl(var(--neon-lime)/0.4)] bg-[hsl(var(--neon-lime)/0.08)] backdrop-blur-sm mb-8 shadow-lg shadow-[hsl(var(--neon-lime)/0.1)]"
                            >
                                <span className="relative flex h-2 w-2 mr-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--neon-lime))]"></span>
                                </span>
                                <span className="text-sm font-medium text-[hsl(var(--neon-lime))]">
                                    Trusted by 10,000+ users worldwide
                                </span>
                            </motion.div>

                            {/* Main headline - Desktop */}
                            <h1 className="text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight mb-4 leading-[1.05]">
                                <span className="inline-block text-white text-3d-effect">
                                    Secure SMS
                                </span>
                                <br />
                                <span className="text-[hsl(var(--neon-lime))] neon-text-glow">
                                    Verification
                                </span>
                            </h1>

                            {/* Subheadline - Desktop */}
                            <p className="text-xl text-gray-400 mb-10 max-w-lg leading-relaxed">
                                Get instant access to virtual phone numbers for seamless account verification.
                                <span className="text-white/80 font-medium"> Privacy-first</span>, secure, and lightning fast.
                            </p>

                            {/* CTA buttons - Desktop */}
                            <div className="flex flex-row items-center gap-4 mb-10">
                                <Link href="/register">
                                    <Button
                                        size="lg"
                                        className="h-14 px-10 text-base font-bold bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime-soft))] neon-glow transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.25)]"
                                    >
                                        Get Started Free <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                                <Link href="/watch-demo">
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        className="h-14 px-6 text-base font-semibold border-white/20 text-white hover:bg-white/5 hover:border-white/30 group"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-[hsl(var(--neon-lime))] flex items-center justify-center mr-3 group-hover:scale-110 transition-transform shadow-md">
                                            <svg className="w-3.5 h-3.5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        </div>
                                        Watch Demo
                                    </Button>
                                </Link>
                            </div>

                            {/* Trust indicators - Desktop */}
                            <div className="flex flex-wrap items-center gap-6 text-sm">
                                <div className="flex items-center gap-2 text-gray-400">
                                    <div className="w-5 h-5 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center">
                                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--neon-lime))]" />
                                    </div>
                                    <span>Instant Activation</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-400">
                                    <div className="w-5 h-5 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center">
                                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--neon-lime))]" />
                                    </div>
                                    <span>50+ Countries</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-400">
                                    <div className="w-5 h-5 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center">
                                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--neon-lime))]" />
                                    </div>
                                    <span>Crypto Accepted</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right side - Phone mockup with floating icons */}
                    <div className="flex-1 relative w-full max-w-[300px] md:max-w-[400px] lg:max-w-[380px] xl:max-w-[420px] lg:ml-16 xl:ml-24">
                        {/* Neon lime halo behind phone - larger glow */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[85%] lg:w-[100%] lg:h-[75%] rounded-full bg-[hsl(var(--neon-lime)/0.18)] lg:bg-[hsl(var(--neon-lime)/0.15)] blur-[100px] lg:blur-[80px]" />

                        {/* Floating app icons with dashed flow lines */}
                        <FloatingAppIcon
                            icon="netflix"
                            className="top-0 -left-2 md:-left-6 lg:-left-14 animate-float z-20 scale-75 md:scale-100"
                            delay={0.3}
                            size="md"
                        />
                        <FloatingAppIcon
                            icon="google"
                            className="top-1/4 -right-2 md:-right-2 lg:-right-10 animate-float-delayed z-20 scale-75 md:scale-100"
                            delay={0.5}
                            size="md"
                        />
                        <FloatingAppIcon
                            icon="whatsapp"
                            className="bottom-1/4 -left-2 md:-left-4 lg:-left-10 animate-float-delayed-2 z-20 scale-75 md:scale-100"
                            delay={0.7}
                            size="md"
                        />
                        <FloatingAppIcon
                            icon="telegram"
                            className="hidden lg:block top-12 -right-4 md:-right-6 lg:-right-16 animate-float z-20 scale-75 md:scale-100"
                            delay={0.4}
                            size="md"
                        />
                        <FloatingAppIcon
                            icon="instagram"
                            className="bottom-1/3 -right-2 md:-right-2 lg:-right-8 animate-float-delayed z-20 scale-75 md:scale-100"
                            delay={0.6}
                            size="md"
                        />
                        <FloatingAppIcon
                            icon="tiktok"
                            className="bottom-12 -right-2 md:-right-4 lg:-right-12 animate-float-delayed-2 z-20 scale-75 md:scale-100"
                            delay={0.8}
                            size="sm"
                        />

                        {/* Dashed flow lines SVG - Flow from left side toward phone */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 opacity-30 lg:opacity-100" viewBox="0 0 400 600" preserveAspectRatio="none">
                            {/* Line from top-left flowing right toward phone */}
                            <path
                                d="M -20 100 Q 80 120, 160 160 T 200 220"
                                fill="none"
                                stroke="hsl(72 100% 50% / 0.25)"
                                strokeWidth="2"
                                className="dashed-flow"
                            />
                            {/* Line from middle-left toward phone center */}
                            <path
                                d="M -30 300 Q 60 280, 140 300 T 200 350"
                                fill="none"
                                stroke="hsl(72 100% 50% / 0.2)"
                                strokeWidth="2"
                                className="dashed-flow"
                            />
                            {/* Line from bottom-left curving up to phone */}
                            <path
                                d="M -20 480 Q 80 440, 160 400 T 200 340"
                                fill="none"
                                stroke="hsl(72 100% 50% / 0.25)"
                                strokeWidth="2"
                                className="dashed-flow"
                            />
                            {/* Right side - from top-right flowing down to phone */}
                            <path
                                d="M 420 80 Q 360 120, 300 180 T 240 250"
                                fill="none"
                                stroke="hsl(180 100% 40% / 0.2)"
                                strokeWidth="1.5"
                                className="dashed-flow"
                            />
                            {/* Right side - from bottom-right flowing up to phone */}
                            <path
                                d="M 420 520 Q 360 480, 300 420 T 240 360"
                                fill="none"
                                stroke="hsl(340 80% 55% / 0.2)"
                                strokeWidth="1.5"
                                className="dashed-flow"
                            />
                        </svg>

                        {/* 3D Phone mockup - Optimized for mobile performance */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                                duration: 0.6,
                                delay: 0.15,
                                ease: [0.25, 0.46, 0.45, 0.94] // easeOutQuad - smoother on mobile
                            }}
                            className="relative z-10 will-change-transform"
                            style={{
                                perspective: "1000px",
                                WebkitPerspective: "1000px",
                                backfaceVisibility: "hidden",
                                WebkitBackfaceVisibility: "hidden"
                            }}
                        >
                            {/* 3D Phone container - simplified transforms for mobile */}
                            <div
                                className="relative mx-auto w-[270px] h-[560px] md:w-[330px] md:h-[680px] lg:w-[310px] lg:h-[640px]"
                                style={{
                                    transform: "translateZ(0) rotateY(-8deg) rotateX(2deg)",
                                    transformStyle: "preserve-3d",
                                    WebkitTransform: "translateZ(0) rotateY(-8deg) rotateX(2deg)",
                                    willChange: "transform"
                                }}
                            >
                                {/* Silent switch - left side top */}
                                <div className="absolute -left-[3px] top-24 w-[3px] h-6 bg-gradient-to-r from-gray-700 to-gray-600 rounded-l-sm" />
                                {/* Volume buttons - left side */}
                                <div className="absolute -left-[3px] top-36 w-[3px] h-10 bg-gradient-to-r from-gray-700 to-gray-600 rounded-l-sm" />
                                <div className="absolute -left-[3px] top-52 w-[3px] h-10 bg-gradient-to-r from-gray-700 to-gray-600 rounded-l-sm" />

                                {/* Power button - right side */}
                                <div className="absolute -right-[3px] top-40 w-[3px] h-14 bg-gradient-to-l from-gray-700 to-gray-600 rounded-r-sm" />

                                {/* Phone frame with 3D depth */}
                                <div
                                    className="relative rounded-[2.8rem] lg:rounded-[2.5rem] overflow-hidden w-full h-full"
                                    style={{
                                        background: "linear-gradient(145deg, #2a2a30 0%, #1a1a1f 50%, #0f0f12 100%)",
                                        boxShadow: `
                                            inset 2px 2px 2px rgba(48, 26, 88, 0.77),
                                            inset -2px -2px 2px rgba(0,0,0,0.4),
                                            -25px 25px 70px rgba(0,0,0,0.6),
                                            -15px 15px 40px rgba(0,0,0,0.5),
                                            25px -8px 50px rgba(198,255,0,0.08),
                                            0 0 0 1px rgba(255,255,255,0.06)
                                        `,
                                        border: "7px solid #1f1f24",
                                        transformStyle: "preserve-3d"
                                    }}
                                >
                                    {/* Side edge highlights for 3D effect */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-r from-white/15 to-transparent"
                                        style={{ transform: "translateZ(3px)" }}
                                    />
                                    <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-l from-black/40 to-transparent" />
                                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-b from-white/10 to-transparent" />

                                    {/* Status bar with camera in same row */}
                                    <div className="absolute top-3 left-0 right-0 z-30 flex items-center justify-center px-5">
                                        {/* Left side - Time */}
                                        <div className="flex-1 flex items-center justify-start">
                                            <span className="text-white text-[11px] font-semibold tracking-tight whitespace-nowrap">
                                                {currentTime || "12:00 PM"}
                                            </span>
                                        </div>

                                        {/* Center - Camera Dot */}
                                        <div className="w-3.5 h-3.5 bg-black rounded-full flex items-center justify-center shadow-md ring-1 ring-gray-800 mx-4">
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-900/80 relative overflow-hidden">
                                                <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-blue-400/40 blur-[0.5px]" />
                                            </div>
                                        </div>

                                        {/* Right side - Status icons */}
                                        <div className="flex-1 flex items-center justify-end gap-1">
                                            {/* Signal with carrier */}
                                            <div className="flex items-center gap-0.5">
                                                <div className="flex items-end gap-[1px] h-3">
                                                    <div className="w-[3px] h-1 bg-white rounded-[1px]" />
                                                    <div className="w-[3px] h-1.5 bg-white rounded-[1px]" />
                                                    <div className="w-[3px] h-2 bg-white rounded-[1px]" />
                                                    <div className="w-[3px] h-3 bg-white rounded-[1px]" />
                                                </div>
                                                <span className="text-white text-[8px] font-medium ml-0.5">5G</span>
                                            </div>

                                            {/* Battery with percentage */}
                                            <div className="flex items-center gap-0.5">
                                                <span className="text-white text-[9px] font-medium">{battery.level}%</span>
                                                <div className="relative w-6 h-3 border border-white/70 rounded-[2px]">
                                                    <div
                                                        className={`absolute top-[2px] left-[2px] bottom-[2px] rounded-[1px] transition-all ${battery.level > 20
                                                            ? battery.charging ? 'bg-green-400' : 'bg-white'
                                                            : 'bg-red-400'
                                                            }`}
                                                        style={{ width: `${Math.max(battery.level * 0.85, 8)}%` }}
                                                    />
                                                    <div className="absolute -right-[4px] top-1/2 -translate-y-1/2 w-[3px] h-2 bg-white/70 rounded-r-[2px]" />
                                                    {battery.charging && (
                                                        <Zap className="absolute inset-0 m-auto w-2 h-2 text-black" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Phone screen content */}
                                    <div className="w-full h-full bg-gradient-to-b from-[#1a1a1f] via-[#151518] to-[#0d1f1f] p-4 pt-10">

                                        {/* App header with notification */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.3)] to-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.2)] p-1.5">
                                                    <Image
                                                        src="/logos/nexnum-logo.svg"
                                                        alt="NexNum"
                                                        width={30}
                                                        height={20}
                                                        className="text-[hsl(var(--neon-lime))]"
                                                    />
                                                    {/* Notification badge */}
                                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-md">
                                                        3
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-white font-bold text-sm">NexNum</div>
                                                    <div className="text-gray-500 text-[10px]">Virtual Numbers Pro</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Incoming SMS notification */}
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 1.5, duration: 0.5 }}
                                            className="rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 p-3 mb-3"
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-white text-xs font-bold">SMS</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-0.5">
                                                        <span className="text-white text-[10px] font-semibold">Verification Code</span>
                                                        <span className="text-gray-400 text-[9px]">now</span>
                                                    </div>
                                                    <p className="text-gray-300 text-[10px] truncate">Your code is: <span className="font-mono font-bold text-[hsl(var(--neon-lime))]">847291</span></p>
                                                </div>
                                            </div>
                                        </motion.div>

                                        {/* Balance card with glowing price */}
                                        <div className="rounded-xl bg-gradient-to-br from-white/8 to-white/3 border border-white/10 p-4 mb-3 shadow-lg">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-gray-400 text-[10px]">Available Balance</div>
                                                <div className="flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                                    <span className="text-green-400 text-[9px]">Synced</span>
                                                </div>
                                            </div>
                                            <div className="text-2xl font-bold text-[hsl(var(--neon-lime))] neon-text-glow mb-1">
                                                $100.00
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="text-gray-500 text-[10px]">≈ 50 verifications</div>
                                                <button className="text-[hsl(var(--neon-lime))] text-[10px] font-medium">+ Add funds</button>
                                            </div>
                                        </div>

                                        {/* Active number card */}
                                        <div className="rounded-xl bg-white/5 border border-white/10 p-3 mb-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-gray-400 text-[10px]">Active Number</span>
                                                <span className="text-green-400 text-[10px] flex items-center">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1 animate-pulse" />
                                                    Live
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-white font-mono text-base tracking-wide">+1 (555) 123-4567</div>
                                                <button className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                                                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 text-[9px] font-medium">🇺🇸 USA</span>
                                                <span className="px-2 py-0.5 rounded-md bg-green-500/20 text-green-400 text-[9px] font-medium">WhatsApp</span>
                                                <span className="px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 text-[9px] font-medium">15m left</span>
                                            </div>
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <button className="flex-1 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center gap-1.5 text-white text-[10px] font-medium hover:bg-white/10 transition-colors">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                Refresh
                                            </button>
                                            <button className="flex-1 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center gap-1.5 text-white text-[10px] font-medium hover:bg-white/10 transition-colors">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                History
                                            </button>
                                        </div>

                                        {/* CTA button in phone */}
                                        <div className="absolute bottom-8 left-4 right-4">
                                            <motion.div
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="h-11 w-full bg-gradient-to-r from-[hsl(var(--neon-lime))] to-[hsl(72,90%,55%)] rounded-xl flex items-center justify-center text-black font-bold text-xs shadow-lg shadow-[hsl(var(--neon-lime)/0.3)] cursor-pointer"
                                            >
                                                <Zap className="w-3.5 h-3.5 mr-1.5" />
                                                Get New Number
                                            </motion.div>
                                        </div>

                                        {/* Home indicator */}
                                        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-white/40 rounded-full" />
                                    </div>
                                </div>

                                {/* Phone reflection below */}
                                <div
                                    className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[80%] h-20 rounded-full"
                                    style={{
                                        background: "radial-gradient(ellipse at center, rgba(198,255,0,0.12) 0%, transparent 70%)",
                                        filter: "blur(15px)"
                                    }}
                                />
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* Mobile layout: Content BELOW phone */}
                <div className="lg:hidden text-center mt-10 px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        {/* CTA buttons - Mobile (side by side, equal size) */}
                        <div className="grid grid-cols-2 gap-3 mb-5 max-w-sm mx-auto">
                            <Link href="/register" className="w-full">
                                <Button
                                    size="lg"
                                    className="w-full h-12 text-xs font-bold bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime-soft))] neon-glow transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.25)]"
                                >
                                    Get Started Free
                                </Button>
                            </Link>
                            <Link href="/watch-demo" className="w-full">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="w-full h-12 text-xs font-semibold border-white/20 text-white hover:bg-white/5 hover:border-white/30"
                                >
                                    Watch Demo
                                </Button>
                            </Link>
                        </div>

                        {/* Trust indicators - Mobile */}
                        <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
                            <div className="flex items-center gap-1.5 text-gray-400">
                                <div className="w-4 h-4 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center">
                                    <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--neon-lime))]" />
                                </div>
                                <span>Instant Activation</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-400">
                                <div className="w-4 h-4 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center">
                                    <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--neon-lime))]" />
                                </div>
                                <span>Crypto Accepted</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-400">
                                <div className="w-4 h-4 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center">
                                    <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--neon-lime))]" />
                                </div>
                                <span>50+ Countries</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div >
        </section >
    );
}

