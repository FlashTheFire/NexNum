"use client";

import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileActionBar from "@/components/common/MobileActionBar";
import {
    Play, Pause, ArrowRight, ArrowLeft, CheckCircle2,
    Zap, Globe, Smartphone, MessageSquare, Clock,
    Volume2, VolumeX, Maximize, Copy, Check,
    Timer, TrendingUp, Star, Quote, ChevronDown,
    SkipBack, SkipForward, Settings
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

// Demo simulation data
const demoSteps = [
    {
        id: 1,
        title: "Select Region & Service",
        shortTitle: "Region",
        description: "Choose from 50+ countries and 100+ supported platforms",
        icon: Globe,
        color: "hsl(180, 70%, 50%)",
        timestamp: "0:00",
        preview: {
            type: "selector",
            countries: ["🇺🇸 United States", "🇬🇧 United Kingdom", "🇩🇪 Germany", "🇫🇷 France"],
            services: ["WhatsApp", "Telegram", "Google", "Twitter"]
        }
    },
    {
        id: 2,
        title: "Instant Number Generation",
        shortTitle: "Generate",
        description: "Virtual number activated in under 3 seconds",
        icon: Zap,
        color: "hsl(75, 100%, 50%)",
        timestamp: "0:18",
        preview: {
            type: "number",
            number: "+1 (555) 847-2903",
            status: "Active",
            expires: "15:00"
        }
    },
    {
        id: 3,
        title: "Real-Time SMS Reception",
        shortTitle: "Receive",
        description: "Messages delivered instantly to your dashboard",
        icon: MessageSquare,
        color: "hsl(280, 70%, 60%)",
        timestamp: "0:35",
        preview: {
            type: "sms",
            sender: "Google",
            message: "Your verification code is: 847293",
            code: "847293",
            time: "Just now"
        }
    },
    {
        id: 4,
        title: "Copy & Verify",
        shortTitle: "Verify",
        description: "One-click copy, instant verification",
        icon: CheckCircle2,
        color: "hsl(120, 70%, 50%)",
        timestamp: "0:52",
        preview: {
            type: "success",
            message: "Verification Complete!",
            details: "Account successfully verified"
        }
    }
];

// Live benchmark data
const benchmarks = [
    { label: "Delivery", value: "2.3s", subtext: "Average time" },
    { label: "Success", value: "99.7%", subtext: "Completion rate" },
    { label: "Uptime", value: "99.99%", subtext: "Availability" },
    { label: "Coverage", value: "54", subtext: "Countries" }
];

// Testimonials
const testimonials = [
    {
        quote: "NexNum cut our verification costs by 60% while improving success rates. The API is incredibly simple.",
        author: "Alex Chen",
        role: "CTO, StartupFlow",
        rating: 5,
        avatar: "AC"
    },
    {
        quote: "Finally, a service that actually works. No more failed verifications. Game changer for our team.",
        author: "Maria Santos",
        role: "Lead Developer",
        rating: 5,
        avatar: "MS"
    },
    {
        quote: "The real-time delivery is insane. Our users complete verification 40% faster now.",
        author: "James Wilson",
        role: "Product Lead",
        rating: 5,
        avatar: "JW"
    }
];

// FAQ
const faqs = [
    { q: "How fast are numbers activated?", a: "Numbers are activated instantly, typically within 1-3 seconds. Our distributed infrastructure ensures minimal latency." },
    { q: "Which platforms are supported?", a: "We support 100+ platforms including WhatsApp, Telegram, Google, Twitter, Instagram, Discord, and many more." },
    { q: "Is the API difficult to integrate?", a: "Not at all. Most developers integrate it in under 30 minutes with our SDKs for Node.js, Python, PHP, and more." },
    { q: "What payment methods do you accept?", a: "We accept cryptocurrencies (BTC, ETH, USDT), credit/debit cards, and various digital wallets." }
];

export default function DemoPage() {
    const [activeStep, setActiveStep] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [isMobile, setIsMobile] = useState(false);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    const [copiedCode, setCopiedCode] = useState(false);
    const [openFaq, setOpenFaq] = useState<number | null>(null);
    const [progress, setProgress] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Mouse parallax for desktop
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const smoothX = useSpring(mouseX, { stiffness: 50, damping: 20 });
    const smoothY = useSpring(mouseY, { stiffness: 50, damping: 20 });
    const layer1X = useTransform(smoothX, [-500, 500], [-15, 15]);
    const layer1Y = useTransform(smoothY, [-500, 500], [-15, 15]);

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

    // Auto-advance steps when playing
    useEffect(() => {
        if (!isPlaying) return;
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    setActiveStep(s => (s + 1) % demoSteps.length);
                    return 0;
                }
                return prev + 2;
            });
        }, 80);
        return () => clearInterval(interval);
    }, [isPlaying]);

    useEffect(() => {
        setProgress(0);
    }, [activeStep]);

    const handleCopyCode = () => {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
    };

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />
            <main ref={containerRef} className="flex-1 bg-gradient-to-br from-[#0a0a0c] via-[#0d1f1f] to-[#0a0a0c] overflow-hidden">
                {/* Premium Background */}
                <div className="fixed inset-0 pointer-events-none z-0">
                    <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 80% 50% at 50% -20%, hsl(180,50%,12%) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 85% 0%, hsl(75,100%,50%,0.06) 0%, transparent 40%), linear-gradient(180deg, #0a0a0c 0%, #0d1f1f 50%, #0a0a0c 100%)` }} />
                    <div className="absolute inset-0 opacity-[0.012]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }} />
                    <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.5) 100%)" }} />
                    {!isMobile && !prefersReducedMotion && (
                        <motion.div className="absolute -top-40 -right-40 w-[600px] h-[600px]" style={{ x: layer1X, y: layer1Y }}>
                            <div className="w-full h-full rounded-full animate-halo-pulse" style={{ background: "radial-gradient(circle, hsl(75,100%,50%,0.1) 0%, transparent 60%)", filter: "blur(80px)" }} />
                        </motion.div>
                    )}
                </div>

                <div className="relative z-10">
                    {/* Header */}
                    <section className="container mx-auto px-4 pt-6 lg:pt-8">
                        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-8 lg:mb-12">
                            <div className="inline-flex items-center px-3 py-1.5 rounded-full border border-[hsl(var(--neon-lime)/0.4)] bg-[hsl(var(--neon-lime)/0.08)] backdrop-blur-sm mb-4 lg:mb-6">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2" />
                                <span className="text-xs lg:text-sm font-medium text-[hsl(var(--neon-lime))]">Live Demo</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-white mb-3 lg:mb-4">
                                Experience <span className="text-[hsl(var(--neon-lime))]">Real-Time</span> Verification
                            </h1>
                            <p className="text-gray-400 text-sm lg:text-lg max-w-xl mx-auto">
                                Watch our platform in action — from number selection to verified account.
                            </p>
                        </motion.div>
                    </section>

                    {/* Video Player - Premium */}
                    <section id="features" className="container mx-auto px-4 mb-12 lg:mb-20">
                        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="max-w-5xl mx-auto">

                            {/* Mobile: Vertical scrollable cards */}
                            {isMobile ? (
                                <div className="space-y-4">
                                    {/* Main player card */}
                                    <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                        {/* Video area */}
                                        <div className="relative aspect-[4/3] bg-gradient-to-br from-[#1a1a1f] to-[#0d1f1f]">
                                            <AnimatePresence mode="wait">
                                                <motion.div key={activeStep} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center p-6">
                                                    {demoSteps[activeStep].preview.type === "selector" && (
                                                        <div className="w-full space-y-3">
                                                            <p className="text-xs text-gray-400 text-center mb-3">Select Country</p>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {demoSteps[activeStep].preview.countries?.map((c, i) => (
                                                                    <motion.div key={c} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className={`p-3 rounded-xl text-sm text-center ${i === 0 ? "bg-[hsl(var(--neon-lime)/0.15)] border border-[hsl(var(--neon-lime)/0.4)] text-white" : "bg-white/5 text-gray-400"}`}>
                                                                        {c}
                                                                    </motion.div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {demoSteps[activeStep].preview.type === "number" && (
                                                        <div className="text-center">
                                                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-16 h-16 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center mx-auto mb-4">
                                                                <Smartphone className="w-8 h-8 text-[hsl(var(--neon-lime))]" />
                                                            </motion.div>
                                                            <p className="text-xl font-mono text-white mb-2">{demoSteps[activeStep].preview.number}</p>
                                                            <div className="flex items-center justify-center gap-2">
                                                                <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs">● Active</span>
                                                                <span className="text-gray-400 text-xs flex items-center gap-1"><Timer className="w-3 h-3" />15:00</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {demoSteps[activeStep].preview.type === "sms" && (
                                                        <div className="w-full p-4 rounded-xl bg-white/5 border border-white/10">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="font-medium text-white text-sm">{demoSteps[activeStep].preview.sender}</span>
                                                                <span className="text-xs text-gray-400">Just now</span>
                                                            </div>
                                                            <p className="text-gray-300 text-sm mb-3">{demoSteps[activeStep].preview.message}</p>
                                                            <button onClick={handleCopyCode} className="w-full p-3 rounded-xl bg-[hsl(var(--neon-lime)/0.1)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center gap-2">
                                                                {copiedCode ? <><Check className="w-4 h-4 text-green-400" /><span className="text-green-400 font-mono">Copied!</span></> : <><Copy className="w-4 h-4 text-[hsl(var(--neon-lime))]" /><span className="text-[hsl(var(--neon-lime))] font-mono text-lg">847293</span></>}
                                                            </button>
                                                        </div>
                                                    )}
                                                    {demoSteps[activeStep].preview.type === "success" && (
                                                        <div className="text-center">
                                                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }} className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                                                <CheckCircle2 className="w-10 h-10 text-green-400" />
                                                            </motion.div>
                                                            <p className="text-lg font-bold text-white mb-1">Verification Complete!</p>
                                                            <p className="text-gray-400 text-sm">Account successfully verified</p>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            </AnimatePresence>

                                            {/* Glow */}
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${demoSteps[activeStep].color}20, transparent 70%)`, filter: "blur(40px)" }} />
                                        </div>

                                        {/* Controls */}
                                        <div className="p-4 bg-black/40">
                                            {/* Progress */}
                                            <div className="h-1 bg-white/10 rounded-full mb-4 overflow-hidden">
                                                <motion.div className="h-full bg-[hsl(var(--neon-lime))] rounded-full" style={{ width: `${((activeStep / demoSteps.length) * 100) + (progress / demoSteps.length)}%` }} />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => setActiveStep(s => s > 0 ? s - 1 : demoSteps.length - 1)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><SkipBack className="w-4 h-4 text-white" /></button>
                                                    <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 rounded-full bg-[hsl(var(--neon-lime))] flex items-center justify-center">
                                                        {isPlaying ? <Pause className="w-5 h-5 text-black" /> : <Play className="w-5 h-5 text-black ml-0.5" />}
                                                    </button>
                                                    <button onClick={() => setActiveStep(s => (s + 1) % demoSteps.length)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><SkipForward className="w-4 h-4 text-white" /></button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white/60 text-xs font-mono">{demoSteps[activeStep].timestamp}</span>
                                                    <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><Maximize className="w-3.5 h-3.5 text-white" /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Step cards - vertical scroll */}
                                    <div className="space-y-2">
                                        {demoSteps.map((step, i) => (
                                            <motion.button key={step.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} onClick={() => setActiveStep(i)}
                                                className={`w-full p-4 rounded-xl text-left flex items-center gap-4 transition-all ${activeStep === i ? "bg-white/[0.06] border border-[hsl(var(--neon-lime)/0.3)]" : "bg-white/[0.02] border border-transparent"}`}>
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${activeStep === i ? "" : "opacity-50"}`} style={{ background: activeStep === i ? `${step.color}20` : "rgba(255,255,255,0.05)" }}>
                                                    <step.icon className="w-5 h-5" style={{ color: activeStep === i ? step.color : "#666" }} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`font-medium truncate ${activeStep === i ? "text-white" : "text-gray-400"}`}>{step.title}</p>
                                                    <p className="text-xs text-gray-500 truncate">{step.description}</p>
                                                </div>
                                                <span className="text-xs text-gray-500 font-mono">{step.timestamp}</span>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                /* Desktop: Side-by-side layout */
                                <div className="grid lg:grid-cols-5 gap-6">
                                    <div className="lg:col-span-3">
                                        <div className="relative aspect-video rounded-3xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 100px hsl(75,100%,50%,0.03)" }}>
                                            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1f] to-[#0d1f1f]">
                                                <AnimatePresence mode="wait">
                                                    <motion.div key={activeStep} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute inset-0 flex items-center justify-center p-8">
                                                        {demoSteps[activeStep].preview.type === "selector" && (
                                                            <div className="w-full max-w-md space-y-4">
                                                                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                                                    <p className="text-sm text-gray-400 mb-3">Select Country</p>
                                                                    <div className="grid grid-cols-2 gap-3">
                                                                        {demoSteps[activeStep].preview.countries?.map((c, i) => (
                                                                            <motion.div key={c} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} className={`p-3 rounded-xl text-sm cursor-pointer transition-all ${i === 0 ? "bg-[hsl(var(--neon-lime)/0.2)] border border-[hsl(var(--neon-lime)/0.5)] text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                                                                                {c}
                                                                            </motion.div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {demoSteps[activeStep].preview.type === "number" && (
                                                            <div className="text-center">
                                                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center mx-auto mb-6">
                                                                    <Smartphone className="w-10 h-10 text-[hsl(var(--neon-lime))]" />
                                                                </motion.div>
                                                                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-3xl font-mono text-white mb-3">{demoSteps[activeStep].preview.number}</motion.p>
                                                                <div className="flex items-center justify-center gap-4">
                                                                    <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm">● Active</span>
                                                                    <span className="text-gray-400 text-sm flex items-center gap-1"><Timer className="w-4 h-4" />15:00</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {demoSteps[activeStep].preview.type === "sms" && (
                                                            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-sm p-5 rounded-2xl bg-white/5 border border-white/10">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <span className="font-medium text-white">{demoSteps[activeStep].preview.sender}</span>
                                                                    <span className="text-xs text-gray-400">Just now</span>
                                                                </div>
                                                                <p className="text-gray-300 mb-4">{demoSteps[activeStep].preview.message}</p>
                                                                <button onClick={handleCopyCode} className="w-full p-4 rounded-xl bg-[hsl(var(--neon-lime)/0.1)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center gap-2 hover:bg-[hsl(var(--neon-lime)/0.15)] transition-colors">
                                                                    {copiedCode ? <><Check className="w-5 h-5 text-green-400" /><span className="text-green-400 font-mono text-xl">Copied!</span></> : <><Copy className="w-5 h-5 text-[hsl(var(--neon-lime))]" /><span className="text-[hsl(var(--neon-lime))] font-mono text-2xl">847293</span></>}
                                                                </button>
                                                            </motion.div>
                                                        )}
                                                        {demoSteps[activeStep].preview.type === "success" && (
                                                            <div className="text-center">
                                                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                                                                    <CheckCircle2 className="w-12 h-12 text-green-400" />
                                                                </motion.div>
                                                                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-2xl font-bold text-white mb-2">Verification Complete!</motion.p>
                                                                <p className="text-gray-400">Account successfully verified</p>
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                </AnimatePresence>
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${demoSteps[activeStep].color}15, transparent 70%)`, filter: "blur(60px)", transition: "background 0.5s" }} />
                                            </div>

                                            {/* Premium controls */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <span className="text-white/60 text-xs font-mono w-10">{demoSteps[activeStep].timestamp}</span>
                                                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer group">
                                                        <motion.div className="h-full bg-gradient-to-r from-[hsl(var(--neon-lime))] to-[hsl(75,100%,60%)] rounded-full relative" style={{ width: `${((activeStep / demoSteps.length) * 100) + (progress / demoSteps.length)}%` }}>
                                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </motion.div>
                                                    </div>
                                                    <span className="text-white/60 text-xs font-mono w-10">1:05</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => setActiveStep(s => s > 0 ? s - 1 : demoSteps.length - 1)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><SkipBack className="w-4 h-4 text-white" /></button>
                                                        <button onClick={() => setIsPlaying(!isPlaying)} className="w-14 h-14 rounded-full bg-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime-soft))] flex items-center justify-center transition-all shadow-lg shadow-[hsl(var(--neon-lime)/0.3)]">
                                                            {isPlaying ? <Pause className="w-6 h-6 text-black" /> : <Play className="w-6 h-6 text-black ml-1" />}
                                                        </button>
                                                        <button onClick={() => setActiveStep(s => (s + 1) % demoSteps.length)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><SkipForward className="w-4 h-4 text-white" /></button>
                                                        <button onClick={() => setIsMuted(!isMuted)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors ml-2">
                                                            {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-white/60 text-sm">Step {activeStep + 1} of {demoSteps.length}</span>
                                                        <button className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><Settings className="w-4 h-4 text-white" /></button>
                                                        <button className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><Maximize className="w-4 h-4 text-white" /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="lg:col-span-2 space-y-3">
                                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-2">Demo Steps</p>
                                        {demoSteps.map((step, i) => (
                                            <button key={step.id} onClick={() => setActiveStep(i)} className={`w-full p-4 rounded-xl text-left transition-all group ${activeStep === i ? "bg-white/[0.06] border border-[hsl(var(--neon-lime)/0.3)]" : "bg-transparent hover:bg-white/[0.03] border border-transparent"}`}>
                                                <div className="flex items-start gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${activeStep === i ? "scale-110" : "opacity-50 group-hover:opacity-70"}`} style={{ background: activeStep === i ? `${step.color}20` : "rgba(255,255,255,0.05)" }}>
                                                        <step.icon className="w-5 h-5" style={{ color: activeStep === i ? step.color : "#666" }} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <p className={`font-medium ${activeStep === i ? "text-white" : "text-gray-400"}`}>{step.title}</p>
                                                            <span className="text-xs text-gray-500 font-mono">{step.timestamp}</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500">{step.description}</p>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </section>

                    {/* Live Benchmarks */}
                    <section id="how-it-works" className="py-12 lg:py-16 border-t border-white/5">
                        <div className="container mx-auto px-4">
                            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-8">
                                <div className="inline-flex items-center gap-2 text-[hsl(var(--neon-lime))] mb-2">
                                    <TrendingUp className="w-4 h-4" />
                                    <span className="text-xs font-medium uppercase tracking-wider">Live Performance</span>
                                </div>
                                <h2 className="text-xl lg:text-3xl font-bold text-white">Real-Time Platform Metrics</h2>
                            </motion.div>

                            <div className={`grid ${isMobile ? "grid-cols-2" : "sm:grid-cols-4"} gap-3 lg:gap-4 max-w-3xl mx-auto`}>
                                {benchmarks.map((item, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="p-4 lg:p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
                                        <p className="text-2xl lg:text-3xl font-bold text-[hsl(var(--neon-lime))] mb-1">{item.value}</p>
                                        <p className="text-white font-medium text-sm mb-0.5">{item.label}</p>
                                        <p className="text-xs text-gray-500">{item.subtext}</p>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* FAQ */}
                    <section id="faq" className="py-12 lg:py-16">
                        <div className="container mx-auto px-4">
                            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-8">
                                <h2 className="text-xl lg:text-3xl font-bold text-white">Quick Answers</h2>
                            </motion.div>

                            <div className="max-w-2xl mx-auto space-y-2 lg:space-y-3">
                                {faqs.map((faq, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="rounded-xl border border-white/[0.06] overflow-hidden">
                                        <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full p-4 lg:p-5 flex items-center justify-between text-left bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                                            <span className="text-white font-medium text-sm lg:text-base pr-4">{faq.q}</span>
                                            <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                                        </button>
                                        <AnimatePresence>
                                            {openFaq === i && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                                                    <p className="px-4 lg:px-5 pb-4 lg:pb-5 text-gray-400 text-sm">{faq.a}</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* CTA */}
                    <section className="py-12 lg:py-16">
                        <div className="container mx-auto px-4">
                            <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="max-w-2xl mx-auto text-center">
                                <div className="relative rounded-2xl lg:rounded-3xl overflow-hidden p-6 lg:p-10" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2" style={{ background: "radial-gradient(ellipse at top, hsl(75,100%,50%,0.1) 0%, transparent 70%)", filter: "blur(40px)" }} />
                                    <div className="relative z-10">
                                        <h2 className="text-xl lg:text-2xl font-bold text-white mb-3">Ready to Try It?</h2>
                                        <p className="text-gray-400 text-sm mb-6">Start free. No credit card required.</p>
                                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                                            <Link href="/register" className="w-full sm:w-auto">
                                                <Button size="lg" className="w-full sm:w-auto h-12 px-6 text-sm font-bold bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime-soft))] neon-glow transition-all shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] group">
                                                    Start Free Trial <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                                </Button>
                                            </Link>
                                            <Link href="/login" className="w-full sm:w-auto">
                                                <Button variant="outline" size="lg" className="w-full sm:w-auto h-12 px-6 border-white/20 text-white hover:bg-white/5">Sign In</Button>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </section>
                </div>
            </main>
            <MobileActionBar />
            <Footer />
        </div>
    );
}
