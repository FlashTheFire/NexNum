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
    SkipBack, SkipForward, Settings, Search, ShoppingCart,
    TrendingDown, DollarSign, Package, Server, Shield,
    Sparkles, Inbox
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils/utils";

// Animated Cursor Component for Professional Demo
const DemoCursor = ({
    position,
    isClicking,
    isHovering,
    isVisible
}: {
    position: { x: number; y: number };
    isClicking: boolean;
    isHovering: boolean;
    isVisible: boolean;
}) => (
    <AnimatePresence>
        {isVisible && (
            <motion.div
                className="pointer-events-none fixed z-[9999]"
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                    opacity: 1,
                    scale: 1,
                    x: position.x - 12,
                    y: position.y - 12
                }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{
                    x: { type: "spring", stiffness: 300, damping: 25 },
                    y: { type: "spring", stiffness: 300, damping: 25 },
                    opacity: { duration: 0.2 },
                    scale: { duration: 0.2 }
                }}
            >
                {/* Glow trail */}
                <motion.div
                    className="absolute inset-0 rounded-full"
                    animate={{
                        scale: isHovering ? 2.5 : 1.5,
                        opacity: isClicking ? 0.4 : 0.2
                    }}
                    style={{
                        background: 'radial-gradient(circle, hsl(75, 100%, 50%, 0.4) 0%, transparent 70%)',
                        filter: 'blur(8px)'
                    }}
                />

                {/* Main cursor ring */}
                <motion.div
                    className={cn(
                        "w-6 h-6 rounded-full border-2 border-[hsl(var(--neon-lime))] flex items-center justify-center",
                        "shadow-[0_0_20px_hsl(var(--neon-lime)/0.5)]"
                    )}
                    animate={{
                        scale: isClicking ? 0.7 : isHovering ? 1.4 : 1,
                        borderWidth: isHovering ? 3 : 2,
                        backgroundColor: isHovering ? 'hsla(75, 100%, 50%, 0.15)' : 'transparent'
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                    {/* Inner dot */}
                    <motion.div
                        className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))]"
                        animate={{
                            scale: isClicking ? 2 : 1,
                            opacity: isClicking ? 0 : 1
                        }}
                    />
                </motion.div>

                {/* Click ripple effect */}
                <AnimatePresence>
                    {isClicking && (
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center"
                            initial={{ scale: 0.5, opacity: 1 }}
                            animate={{ scale: 3, opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                        >
                            <div className="w-6 h-6 rounded-full border-2 border-[hsl(var(--neon-lime))]" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        )}
    </AnimatePresence>
);

// Focus/Spotlight Overlay Component - Professional Sharp Style
const FocusOverlay = ({
    isActive,
    targetPosition,
    playerBounds,
}: {
    isActive: boolean;
    targetPosition: { x: number; y: number };
    playerBounds: { left: number; top: number; width: number; height: number };
}) => {
    // Calculate relative position within the player bounds
    const relativeX = targetPosition.x - playerBounds.left;
    const relativeY = targetPosition.y - playerBounds.top;

    return (
        <AnimatePresence>
            {isActive && (
                <motion.div
                    className="absolute inset-0 z-[9990] pointer-events-none overflow-hidden rounded-2xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <svg className="absolute inset-0 w-full h-full" style={{ isolation: 'isolate' }}>
                        <defs>
                            {/* Sharp spotlight gradient with crisp edge */}
                            <radialGradient id="sharp-spotlight" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                                <stop offset="0%" stopColor="transparent" />
                                <stop offset="70%" stopColor="transparent" />
                                <stop offset="85%" stopColor="rgba(0,0,0,0.3)" />
                                <stop offset="95%" stopColor="rgba(0,0,0,0.7)" />
                                <stop offset="100%" stopColor="rgba(0,0,0,0.85)" />
                            </radialGradient>

                            {/* Inner glow ring for premium effect */}
                            <radialGradient id="glow-ring" cx="50%" cy="50%" r="50%">
                                <stop offset="65%" stopColor="transparent" />
                                <stop offset="72%" stopColor="hsla(75, 100%, 50%, 0.15)" />
                                <stop offset="78%" stopColor="hsla(75, 100%, 50%, 0.05)" />
                                <stop offset="85%" stopColor="transparent" />
                            </radialGradient>

                            {/* Sharp mask for clean cutout */}
                            <mask id="sharp-mask">
                                <rect fill="white" width="100%" height="100%" />
                                <motion.ellipse
                                    fill="black"
                                    animate={{ cx: relativeX, cy: relativeY }}
                                    rx="240"
                                    ry="170"
                                    transition={{ type: "spring", stiffness: 150, damping: 25 }}
                                />
                            </mask>

                            {/* Soft feathered mask for gradient overlay */}
                            <mask id="feather-mask">
                                <rect fill="white" width="100%" height="100%" />
                                <motion.ellipse
                                    fill="black"
                                    animate={{ cx: relativeX, cy: relativeY }}
                                    rx="320"
                                    ry="230"
                                    transition={{ type: "spring", stiffness: 150, damping: 25 }}
                                >
                                    <animate attributeName="rx" values="320;325;320" dur="3s" repeatCount="indefinite" />
                                    <animate attributeName="ry" values="230;235;230" dur="3s" repeatCount="indefinite" />
                                </motion.ellipse>
                            </mask>
                        </defs>

                        {/* Layer 1: Deep vignette background */}
                        <rect
                            fill="rgba(0,0,0,0.75)"
                            mask="url(#sharp-mask)"
                            width="100%"
                            height="100%"
                        />

                        {/* Layer 2: Soft gradient transition */}
                        <rect
                            fill="rgba(0,0,0,0.25)"
                            mask="url(#feather-mask)"
                            width="100%"
                            height="100%"
                        />

                        {/* Layer 3: Subtle glow ring around spotlight */}
                        <motion.ellipse
                            animate={{ cx: relativeX, cy: relativeY }}
                            rx="250"
                            ry="180"
                            fill="none"
                            stroke="hsla(75, 100%, 50%, 0.12)"
                            strokeWidth="3"
                            transition={{ type: "spring", stiffness: 150, damping: 25 }}
                        />
                        <motion.ellipse
                            animate={{ cx: relativeX, cy: relativeY }}
                            rx="245"
                            ry="175"
                            fill="none"
                            stroke="hsla(75, 100%, 50%, 0.06)"
                            strokeWidth="8"
                            filter="blur(4px)"
                            transition={{ type: "spring", stiffness: 150, damping: 25 }}
                        />
                    </svg>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// Professional Sound Effects System - Smooth, Studio-Quality Audio
const useDemoSounds = (isMuted: boolean) => {
    const audioContextRef = useRef<AudioContext | null>(null);

    const getAudioContext = () => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        // Resume if suspended (browser autoplay policy)
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }
        return audioContextRef.current;
    };

    // Professional tone with ADSR envelope
    const playProfessionalTone = (
        frequency: number,
        duration: number,
        options: {
            type?: OscillatorType;
            volume?: number;
            attack?: number;
            decay?: number;
            sustain?: number;
            release?: number;
            filterFreq?: number;
        } = {}
    ) => {
        if (isMuted) return;
        try {
            const ctx = getAudioContext();
            const {
                type = 'sine',
                volume = 0.08,
                attack = 0.01,
                decay = 0.1,
                sustain = 0.3,
                release = 0.15,
                filterFreq = 2000
            } = options;

            const now = ctx.currentTime;
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            // Low-pass filter for smoother sound
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            filter.Q.value = 0.7;

            oscillator.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = type;

            // ADSR Envelope for smooth, professional sound
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(volume, now + attack); // Attack
            gainNode.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay); // Decay to sustain
            gainNode.gain.setValueAtTime(volume * sustain, now + duration - release); // Hold sustain
            gainNode.gain.linearRampToValueAtTime(0, now + duration); // Release

            oscillator.start(now);
            oscillator.stop(now + duration + 0.1);
        } catch (e) {
            // Audio not supported
        }
    };

    // Soft UI click - subtle, tactile feedback
    const playClick = () => {
        // Soft high-frequency click
        playProfessionalTone(1200, 0.06, {
            type: 'sine',
            volume: 0.04,
            attack: 0.002,
            decay: 0.02,
            sustain: 0.2,
            release: 0.04,
            filterFreq: 3000
        });
        // Soft low-end thump for weight
        setTimeout(() => {
            playProfessionalTone(150, 0.08, {
                type: 'sine',
                volume: 0.03,
                attack: 0.005,
                decay: 0.05,
                sustain: 0.1,
                release: 0.03,
                filterFreq: 400
            });
        }, 5);
    };

    // Subtle hover - barely audible warmth
    const playHover = () => {
        playProfessionalTone(600, 0.08, {
            type: 'sine',
            volume: 0.015,
            attack: 0.02,
            decay: 0.04,
            sustain: 0.2,
            release: 0.04,
            filterFreq: 1200
        });
    };

    // Soft keystroke - gentle typing feedback
    const playType = () => {
        const pitch = 800 + Math.random() * 200;
        playProfessionalTone(pitch, 0.04, {
            type: 'sine',
            volume: 0.02,
            attack: 0.002,
            decay: 0.015,
            sustain: 0.15,
            release: 0.025,
            filterFreq: 2500
        });
    };

    // Triumphant success - musical chord progression
    const playSuccess = () => {
        // C Major chord arpeggio (C-E-G-C)
        const notes = [
            { freq: 523.25, delay: 0, vol: 0.05 },     // C5
            { freq: 659.25, delay: 80, vol: 0.04 },    // E5
            { freq: 783.99, delay: 160, vol: 0.04 },   // G5
            { freq: 1046.50, delay: 240, vol: 0.05 }   // C6
        ];
        notes.forEach(({ freq, delay, vol }) => {
            setTimeout(() => {
                playProfessionalTone(freq, 0.35, {
                    type: 'sine',
                    volume: vol,
                    attack: 0.02,
                    decay: 0.1,
                    sustain: 0.5,
                    release: 0.2,
                    filterFreq: 4000
                });
            }, delay);
        });
    };

    // Smooth transition - gentle whoosh
    const playTransition = () => {
        playProfessionalTone(250, 0.25, {
            type: 'sine',
            volume: 0.025,
            attack: 0.05,
            decay: 0.1,
            sustain: 0.3,
            release: 0.1,
            filterFreq: 800
        });
        setTimeout(() => {
            playProfessionalTone(350, 0.2, {
                type: 'sine',
                volume: 0.02,
                attack: 0.03,
                decay: 0.08,
                sustain: 0.25,
                release: 0.1,
                filterFreq: 1000
            });
        }, 60);
    };

    // Copy confirmation - crisp double-tap
    const playCopy = () => {
        playProfessionalTone(1400, 0.05, {
            type: 'sine',
            volume: 0.035,
            attack: 0.003,
            decay: 0.02,
            sustain: 0.2,
            release: 0.03,
            filterFreq: 3500
        });
        setTimeout(() => {
            playProfessionalTone(1800, 0.06, {
                type: 'sine',
                volume: 0.03,
                attack: 0.003,
                decay: 0.025,
                sustain: 0.2,
                release: 0.035,
                filterFreq: 4000
            });
        }, 40);
    };

    return { playClick, playHover, playType, playSuccess, playTransition, playCopy };
};

// Demo services data - Real mock data from API with price/stock for sorting
const demoServices = [
    { id: "ig", name: "Instagram + Threads", iconUrl: "https://smsbower.org/img/services/4.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bz.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cn.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg"], lowestPrice: 0.56, totalStock: 10247007 },
    { id: "tw", name: "Twitter / X", iconUrl: "https://smsbower.org/img/services/20.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bh.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/us.svg"], lowestPrice: 0.55, totalStock: 8795558 },
    { id: "vi", name: "Viber", iconUrl: "https://smsbower.org/img/services/8.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/gh.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/dj.svg"], lowestPrice: 0.52, totalStock: 8483903 },
    { id: "fb", name: "Facebook", iconUrl: "https://smsbower.org/img/services/9.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ao.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ar.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ky.svg"], lowestPrice: 0.56, totalStock: 4228604 },
    { id: "ki", name: "99app", iconUrl: "https://smsbower.org/img/services/703.webp?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ir.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cn.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ky.svg"], lowestPrice: 0.52, totalStock: 4027934 },
    { id: "li", name: "Baidu", iconUrl: "https://smsbower.org/img/services/770.webp?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/eg.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/la.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/jp.svg"], lowestPrice: 0.52, totalStock: 3273795 },
    { id: "fr", name: "Dana", iconUrl: "https://smsbower.org/img/services/104.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/af.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/vn.svg"], lowestPrice: 0.52, totalStock: 3265921 },
    { id: "ju", name: "Indomaret", iconUrl: "https://smsbower.org/img/services/266.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/af.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/vn.svg"], lowestPrice: 0.52, totalStock: 3238345 },
    { id: "dr", name: "Openai", iconUrl: "https://smsbower.org/img/services/247.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/al.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ao.svg"], lowestPrice: 0.61, totalStock: 3016239 },
    { id: "ni", name: "Gojek", iconUrl: "https://smsbower.org/img/services/118.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/af.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/nl.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/vn.svg"], lowestPrice: 0.52, totalStock: 2968343 },
    { id: "wr", name: "Walmart", iconUrl: "https://smsbower.org/img/services/793.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/hu.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/nl.svg"], lowestPrice: 0.52, totalStock: 2967304 },
    { id: "mo", name: "Bumble", iconUrl: "https://smsbower.org/img/services/290.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/af.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/kw.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cy.svg"], lowestPrice: 0.52, totalStock: 2415716 },
    { id: "df", name: "Happn", iconUrl: "https://smsbower.org/img/services/742.webp?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cn.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/kw.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/eg.svg"], lowestPrice: 0.52, totalStock: 2106814 },
    { id: "afz", name: "Klarna", iconUrl: "https://smsbower.org/img/services/913.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/tw.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/la.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/gh.svg"], lowestPrice: 0.52, totalStock: 1812645 },
    { id: "abk", name: "Gmx", iconUrl: "https://smsbower.org/img/services/920.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cn.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cg.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bh.svg"], lowestPrice: 0.54, totalStock: 1644670 },
    { id: "wx", name: "Apple", iconUrl: "https://smsbower.org/img/services/195.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ph.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/do.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/td.svg"], lowestPrice: 0.57, totalStock: 1541695 },
    { id: "mm", name: "Microsoft", iconUrl: "https://smsbower.org/img/services/25.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/do.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/in.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/gh.svg"], lowestPrice: 0.54, totalStock: 1498160 },
    { id: "yw", name: "Grindr", iconUrl: "https://smsbower.org/img/services/116.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/dz.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bh.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bo.svg"], lowestPrice: 0.51, totalStock: 1092477 },
    { id: "pm", name: "Aol", iconUrl: "https://smsbower.org/img/services/54.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/dz.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/do.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bd.svg"], lowestPrice: 0.51, totalStock: 1258407 },
    { id: "xt", name: "Flipkart", iconUrl: "https://smsbower.org/img/services/345.svg?timestamp=1751359625", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/hu.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/in.svg"], lowestPrice: 0.52, totalStock: 248511 },
    { id: "hp", name: "Meesho", iconUrl: "https://grizzlysms.com/api/storage/image/19505.webp", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/hu.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/in.svg"], lowestPrice: 0.52, totalStock: 176076 },
    { id: "ds", name: "Discord", iconUrl: "https://smsbower.org/img/services/61.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/al.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/dz.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/do.svg"], lowestPrice: 0.55, totalStock: 1876448 },
    { id: "nf", name: "Netflix", iconUrl: "https://smsbower.org/img/services/19.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ma.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/na.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/au.svg"], lowestPrice: 0.51, totalStock: 1532407 },
    { id: "acz", name: "Claude", iconUrl: "https://smsbower.org/img/services/802.svg?timestamp=1748774536", flags: ["https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cn.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/kw.svg", "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ao.svg"], lowestPrice: 0.52, totalStock: 615218 },
];

const demoCountries = [
    { id: "iraq", name: "Iraq", code: "iraq", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/iq.svg", minPrice: 0.56, totalStock: 1165 },
    { id: "china", name: "China", code: "china", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cn.svg", minPrice: 0.57, totalStock: 11865 },
    { id: "australia", name: "Australia", code: "australia", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/au.svg", minPrice: 0.58, totalStock: 18741 },
    { id: "argentina", name: "Argentina", code: "argentina", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ar.svg", minPrice: 0.6, totalStock: 1506 },
    { id: "brazil", name: "Brazil", code: "brazil", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/br.svg", minPrice: 0.61, totalStock: 481866 },
    { id: "hungary", name: "Hungary", code: "hungary", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/hu.svg", minPrice: 0.61, totalStock: 70060 },
    { id: "india", name: "India", code: "india", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/in.svg", minPrice: 0.61, totalStock: 60203 },
    { id: "bolivia", name: "Bolivia", code: "bolivia", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bo.svg", minPrice: 0.61, totalStock: 30226 },
    { id: "barbados", name: "Barbados", code: "barbados", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bb.svg", minPrice: 0.61, totalStock: 9120 },
    { id: "new-zealand", name: "New Zealand", code: "new-zealand", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/nz.svg", minPrice: 0.61, totalStock: 5412 },
    { id: "angola", name: "Angola", code: "angola", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ao.svg", minPrice: 0.61, totalStock: 1360 },
    { id: "albania", name: "Albania", code: "albania", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/al.svg", minPrice: 0.61, totalStock: 1209 },
    { id: "anguilla", name: "Anguilla", code: "anguilla", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ai.svg", minPrice: 0.61, totalStock: 1121 },
    { id: "botswana", name: "Botswana", code: "botswana", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bw.svg", minPrice: 0.61, totalStock: 1120 },
    { id: "bahamas", name: "Bahamas", code: "bahamas", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bs.svg", minPrice: 0.61, totalStock: 1118 },
    { id: "aruba", name: "Aruba", code: "aruba", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/aw.svg", minPrice: 0.61, totalStock: 1085 },
    { id: "somalia", name: "Somalia", code: "somalia", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/so.svg", minPrice: 0.61, totalStock: 1063 },
    { id: "serbia", name: "Serbia", code: "serbia", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/rs.svg", minPrice: 0.61, totalStock: 1052 },
    { id: "chad", name: "Chad", code: "chad", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/td.svg", minPrice: 0.61, totalStock: 1021 },
    { id: "brunei-darussalam", name: "Brunei Darussalam", code: "brunei-darussalam", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bn.svg", minPrice: 0.61, totalStock: 1008 },
    { id: "montserrat", name: "Montserrat", code: "montserrat", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ms.svg", minPrice: 0.61, totalStock: 996 },
    { id: "hong-kong", name: "Hong Kong", code: "hong-kong", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/hk.svg", minPrice: 0.63, totalStock: 30643 },
    { id: "netherlands", name: "Netherlands", code: "netherlands", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/nl.svg", minPrice: 0.63, totalStock: 27863 },
    { id: "united-states", name: "United States", code: "united-states", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/us.svg", minPrice: 0.63, totalStock: 15325 },
    { id: "israel", name: "Israel", code: "israel", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/il.svg", minPrice: 0.63, totalStock: 1111 },
    { id: "iceland", name: "Iceland", code: "iceland", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/is.svg", minPrice: 0.63, totalStock: 1110 },
    { id: "belize", name: "Belize", code: "belize", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bz.svg", minPrice: 0.63, totalStock: 1105 },
    { id: "zimbabwe", name: "Zimbabwe", code: "zimbabwe", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/zw.svg", minPrice: 0.63, totalStock: 1103 },
    { id: "montenegro", name: "Montenegro", code: "montenegro", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/me.svg", minPrice: 0.63, totalStock: 1100 },
    { id: "sweden", name: "Sweden", code: "sweden", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/se.svg", minPrice: 0.63, totalStock: 2076 },
    { id: "latvia", name: "Latvia", code: "latvia", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/lv.svg", minPrice: 0.63, totalStock: 1091 },
    { id: "saint-vincent", name: "Saint Vincent", code: "saint-vincent", flagUrl: "https://api.dicebear.com/7.x/shapes/svg?seed=SaintVincent", minPrice: 0.63, totalStock: 1090 },
    { id: "kazakhstan", name: "Kazakhstan", code: "kazakhstan", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/kz.svg", minPrice: 0.63, totalStock: 1090 },
    { id: "guatemala", name: "Guatemala", code: "guatemala", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/gt.svg", minPrice: 0.63, totalStock: 1090 },
    { id: "guadeloupe", name: "Guadeloupe", code: "guadeloupe", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/gp.svg", minPrice: 0.63, totalStock: 1086 },
    { id: "croatia", name: "Croatia", code: "croatia", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/hr.svg", minPrice: 0.63, totalStock: 1084 },
    { id: "burundi", name: "Burundi", code: "burundi", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/bi.svg", minPrice: 0.63, totalStock: 1084 },
    { id: "reunion", name: "Reunion", code: "reunion", flagUrl: "https://api.dicebear.com/7.x/shapes/svg?seed=Reunion", minPrice: 0.63, totalStock: 1082 },
    { id: "nepal", name: "Nepal", code: "nepal", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/np.svg", minPrice: 0.63, totalStock: 1080 },
    { id: "taiwan", name: "Taiwan", code: "taiwan", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/tw.svg", minPrice: 0.63, totalStock: 1074 },
    { id: "armenia", name: "Armenia", code: "armenia", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/am.svg", minPrice: 0.63, totalStock: 1074 },
    { id: "swaziland", name: "Swaziland", code: "swaziland", flagUrl: "https://api.dicebear.com/7.x/shapes/svg?seed=Swaziland", minPrice: 0.63, totalStock: 1072 },
    { id: "uzbekistan", name: "Uzbekistan", code: "uzbekistan", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/uz.svg", minPrice: 0.63, totalStock: 1070 },
    { id: "cambodia", name: "Cambodia", code: "cambodia", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/kh.svg", minPrice: 0.63, totalStock: 1787 },
    { id: "oman", name: "Oman", code: "oman", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/om.svg", minPrice: 0.63, totalStock: 1064 },
    { id: "sao-tome-and-principe", name: "Sao Tome And Principe", code: "sao-tome-and-principe", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/st.svg", minPrice: 0.63, totalStock: 1053 },
    { id: "czech-republic", name: "Czech Republic", code: "czech-republic", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/cz.svg", minPrice: 0.63, totalStock: 1376 },
    { id: "venezuela", name: "Venezuela", code: "venezuela", flagUrl: "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/ve.svg", minPrice: 0.63, totalStock: 1048 },
];

const demoOperators = [
    { id: 101, displayName: "NexPremium Tier 1", price: 0.61, stock: 481866, successRate: 98, isBestPrice: true, isVerified: true },
    { id: 102, displayName: "GlobalConnect Bulk", price: 0.65, stock: 124032, successRate: 94, isHighStock: true },
    { id: 103, displayName: "DirectLine Pro", price: 0.72, stock: 8503, successRate: 99, isVerified: true },
    { id: 104, displayName: "Economy Route", price: 0.58, stock: 1205, successRate: 82 },
];

// Demo simulation data with enhanced action choreography
const demoSteps = [
    {
        id: 1,
        title: "Select Service",
        shortTitle: "Service",
        description: "Choose from 100+ supported platforms",
        icon: Globe,
        color: "hsl(180, 70%, 50%)",
        timestamp: "0:00",
        duration: 8,
        preview: { type: "services" },
        actions: [
            { type: "wait", duration: 600 },
            // Search box is in header, right side (~75% from left, ~8.5% from top of player)
            { type: "moveCursor", x: 0.75, y: 0.085, duration: 700 },
            { type: "hover", duration: 400 },
            { type: "click" },
            { type: "type", text: "Face", speed: 180 },
            { type: "wait", duration: 700 },
            // After filtering, Facebook appears as 1st card. Grid: 5 cols on desktop.
            // Card 1 center: ~10% from left, row 1 center: ~42% from top (accounting for header)
            { type: "moveCursor", x: 0.12, y: 0.42, duration: 800 },
            { type: "hover", duration: 500 },
            { type: "click" },
            { type: "select", target: "service", id: "fb" }
        ]
    },
    {
        id: 2,
        title: "Global Coverage",
        shortTitle: "Country",
        description: "Numbers from 50+ global locations",
        icon: Package,
        color: "hsl(75, 100%, 50%)",
        timestamp: "0:08",
        duration: 7,
        preview: { type: "countries" },
        actions: [
            { type: "wait", duration: 500 },
            // Search box in header, right side
            { type: "moveCursor", x: 0.75, y: 0.085, duration: 600 },
            { type: "hover", duration: 350 },
            { type: "click" },
            { type: "type", text: "Ind", speed: 180 },
            { type: "wait", duration: 600 },
            // Country grid is 2 columns on desktop. India appears as 1st result at TOP.
            // Left column center: ~25% from left, first row: ~19% from top (right below header)
            { type: "moveCursor", x: 0.25, y: 0.19, duration: 700 },
            { type: "hover", duration: 450 },
            { type: "click" },
            { type: "select", target: "country", id: "india" }
        ]
    },
    {
        id: 3,
        title: "Provider Selection",
        shortTitle: "Provider",
        description: "Pick top-rated operators with best prices",
        icon: Server,
        color: "hsl(280, 70%, 60%)",
        timestamp: "0:15",
        duration: 12,
        preview: { type: "providers" },
        actions: [
            { type: "wait", duration: 1200 },
            // Provider grid has header + vertical list of operator cards
            // First operator card (NexPremium): center of card ~50% x, ~25% y
            { type: "moveCursor", x: 0.50, y: 0.28, duration: 1000 },
            { type: "hover", duration: 800 },
            { type: "wait", duration: 600 },
            // Move to second operator card (GlobalConnect): ~50% x, ~40% y
            { type: "moveCursor", x: 0.50, y: 0.42, duration: 900 },
            { type: "hover", duration: 800 },
            { type: "click" },
            { type: "select", target: "operator", id: 102 },
            { type: "wait", duration: 800 },
            // Purchase/Buy button at bottom of card: ~50% x, ~75% y
            { type: "moveCursor", x: 0.50, y: 0.72, duration: 800 },
            { type: "hover", duration: 600 },
            { type: "wait", duration: 400 },
            { type: "click" },
            { type: "wait", duration: 800 }
        ]
    },
    {
        id: 4,
        title: "Instant Generation",
        shortTitle: "Generate",
        description: "Virtual number activated in under 3 seconds",
        icon: Zap,
        color: "hsl(200, 100%, 50%)",
        timestamp: "0:27",
        duration: 10,
        preview: { type: "number", number: "+1 (555) 847-2903", status: "Active", expires: "15:00" },
        actions: [
            { type: "wait", duration: 1500 },
            { type: "focus", enabled: false },
            // SMS Inbox view: Phone number is displayed prominently at top
            // Phone number text area: ~35% x, ~15% y
            { type: "moveCursor", x: 0.35, y: 0.12, duration: 1200 },
            { type: "hover", duration: 800 },
            { type: "wait", duration: 600 },
            // Copy button next to phone number: ~55% x, ~12% y
            { type: "moveCursor", x: 0.55, y: 0.12, duration: 800 },
            { type: "hover", duration: 600 },
            { type: "wait", duration: 400 },
            { type: "click" },
            { type: "copy", target: "number" },
            { type: "wait", duration: 1200 }
        ]
    },
    {
        id: 5,
        title: "SMS Reception",
        shortTitle: "Receive",
        description: "Messages delivered instantly to your dashboard",
        icon: MessageSquare,
        color: "hsl(320, 70%, 60%)",
        timestamp: "0:37",
        duration: 12,
        preview: { type: "sms", sender: "Google", message: "Your verification code is: 847293", code: "847293", time: "Just now" },
        actions: [
            { type: "wait", duration: 1500 },
            // SMS message card appears below the phone number section
            // Message card center: ~50% x, ~55% y
            { type: "moveCursor", x: 0.50, y: 0.52, duration: 1200 },
            { type: "hover", duration: 1000 },
            { type: "wait", duration: 800 },
            // Verification code is highlighted in the message
            // Copy code button next to the code: ~75% x, ~60% y
            { type: "moveCursor", x: 0.75, y: 0.58, duration: 900 },
            { type: "hover", duration: 700 },
            { type: "wait", duration: 500 },
            { type: "click" },
            { type: "copy", target: "code" },
            { type: "wait", duration: 1200 }
        ]
    },
    {
        id: 6,
        title: "Copy & Verify",
        shortTitle: "Verify",
        description: "One-click copy, instant verification",
        icon: CheckCircle2,
        color: "hsl(120, 70%, 50%)",
        timestamp: "0:49",
        duration: 8,
        preview: { type: "success", message: "Verification Complete!", details: "Account successfully verified" },
        actions: [
            { type: "wait", duration: 1500 },
            { type: "focus", enabled: false },
            { type: "wait", duration: 1500 },
            // Success animation plays automatically
            { type: "wait", duration: 2000 }
        ]
    }
];

// Live benchmark data
const benchmarks = [
    { label: "Delivery", value: "2.3s", subtext: "Average time" },
    { label: "Success", value: "99.7%", subtext: "Completion rate" },
    { label: "Uptime", value: "99.99%", subtext: "Availability" },
    { label: "Coverage", value: "54", subtext: "Countries" }
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
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedService, setSelectedService] = useState<{ id: string, name: string, iconUrl: string } | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<{ id: string, name: string, code: string, flagUrl: string, minPrice: number, totalStock: number } | null>(null);
    const [selectedOperator, setSelectedOperator] = useState<number | null>(null);
    const [sortOption, setSortOption] = useState<"relevance" | "price_asc" | "stock_desc">("relevance");
    const [currentActionIndex, setCurrentActionIndex] = useState(0);
    const [isScrolling, setIsScrolling] = useState(false);
    const [copiedNumber, setCopiedNumber] = useState(false);

    // Animated cursor state
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
    const [isCursorVisible, setIsCursorVisible] = useState(false);
    const [isCursorHovering, setIsCursorHovering] = useState(false);
    const [isCursorClicking, setIsCursorClicking] = useState(false);
    const [showFocusOverlay, setShowFocusOverlay] = useState(false);
    const [typingText, setTypingText] = useState("");

    // Sound effects hook
    const sounds = useDemoSounds(isMuted);

    // Ref for immediate cancellation of actions
    const isPlayingRef = useRef(false);
    isPlayingRef.current = isPlaying;

    // Player bounds for cursor containment
    const [playerBounds, setPlayerBounds] = useState({ left: 0, top: 0, width: 800, height: 450 });

    // Reset demo state (clear all selections)
    const resetDemo = () => {
        setActiveStep(0);
        setCurrentActionIndex(0);
        setProgress(0);
        setSearchQuery("");
        setTypingText("");
        setSelectedService(null);
        setSelectedCountry(null);
        setSelectedOperator(null);
        setIsCursorVisible(false);
        setIsCursorHovering(false);
        setIsCursorClicking(false);
        setShowFocusOverlay(false);
        setCopiedCode(false);
        setCopiedNumber(false);
    };

    // Reset step-specific data when manually clicking a step (partial reset)
    const resetStepData = () => {
        setCurrentActionIndex(0);
        setProgress(0);
        setSearchQuery("");
        setTypingText("");
        setIsCursorVisible(false);
        setIsCursorHovering(false);
        setIsCursorClicking(false);
        setShowFocusOverlay(false);
        // Clear selections based on step they're navigating to
        setSelectedService(null);
        setSelectedCountry(null);
        setSelectedOperator(null);
        setCopiedCode(false);
        setCopiedNumber(false);
    };

    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);


    // Update player bounds on resize, scroll, and during playback
    useEffect(() => {
        let animationFrameId: number | null = null;
        let isUpdating = false;

        const updateBounds = () => {
            if (playerRef.current && !isUpdating) {
                isUpdating = true;
                const rect = playerRef.current.getBoundingClientRect();
                setPlayerBounds(prev => {
                    // Only update if bounds actually changed (avoid unnecessary re-renders)
                    if (prev.left !== rect.left || prev.top !== rect.top ||
                        prev.width !== rect.width || prev.height !== rect.height) {
                        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
                    }
                    return prev;
                });
                isUpdating = false;
            }
        };

        // Continuous update during playback for smooth cursor positioning
        const continuousUpdate = () => {
            if (isPlaying && playerRef.current) {
                updateBounds();
                animationFrameId = requestAnimationFrame(continuousUpdate);
            }
        };

        // Initial update
        updateBounds();

        // Start continuous updates if playing
        if (isPlaying) {
            continuousUpdate();
        }

        // Event listeners
        window.addEventListener('resize', updateBounds);
        window.addEventListener('scroll', updateBounds, { passive: true });
        document.addEventListener('scroll', updateBounds, { passive: true, capture: true });

        // ResizeObserver for container size changes
        let resizeObserver: ResizeObserver | null = null;
        if (playerRef.current && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(updateBounds);
            resizeObserver.observe(playerRef.current);
        }

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            window.removeEventListener('resize', updateBounds);
            window.removeEventListener('scroll', updateBounds);
            document.removeEventListener('scroll', updateBounds, { capture: true });
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, [activeStep, isPlaying]);

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

    // Auto-advance actions and steps when playing
    const isActionRunningRef = useRef(false);

    useEffect(() => {
        if (!isPlaying) {
            isActionRunningRef.current = false;
            return;
        }

        // Prevent starting multiple action chains
        if (isActionRunningRef.current) return;
        isActionRunningRef.current = true;

        const currentStepData = demoSteps[activeStep] as any;
        if (!currentStepData) {
            isActionRunningRef.current = false;
            return;
        }
        const actions = currentStepData.actions || [];

        // Cancellation-aware wait helper
        const waitWithCancel = (ms: number): Promise<boolean> => {
            return new Promise(resolve => {
                const start = Date.now();
                const check = () => {
                    if (!isPlayingRef.current) {
                        resolve(false); // Cancelled
                        return;
                    }
                    if (Date.now() - start >= ms) {
                        resolve(true); // Completed
                        return;
                    }
                    requestAnimationFrame(check);
                };
                check();
            });
        };

        const runAction = async (index: number) => {
            // Check cancellation before starting
            if (!isPlayingRef.current || activeStep >= demoSteps.length) {
                isActionRunningRef.current = false;
                return;
            }

            // Show cursor when playing
            setIsCursorVisible(true);

            if (index >= actions.length) {
                // Done with actions for this step
                setIsCursorHovering(false);
                setIsCursorClicking(false);

                if (activeStep < demoSteps.length - 1) {
                    sounds.playTransition();
                    const ok = await waitWithCancel(800);
                    if (!ok || !isPlayingRef.current) {
                        isActionRunningRef.current = false;
                        return;
                    }

                    // Reset ref before advancing so new step can start its actions
                    isActionRunningRef.current = false;
                    setActiveStep(s => s + 1);
                    setCurrentActionIndex(0);
                    setTypingText("");
                    setSearchQuery("");
                } else {
                    sounds.playSuccess();
                    setIsPlaying(false);
                    setIsCursorVisible(false);
                    setShowFocusOverlay(false);
                    isActionRunningRef.current = false;
                    // Reset for next cycle
                    setTimeout(() => resetDemo(), 1000);
                }
                return;
            }

            setCurrentActionIndex(index);
            const action = actions[index];
            const duration = action.duration || 0;

            // Use playerBounds for accurate positioning
            const bounds = playerBounds;

            if (action.type === "wait") {
                const ok = await waitWithCancel(duration);
                if (!ok) return;
            } else if (action.type === "moveCursor") {
                // Move cursor to relative position (0-1) within player
                const targetX = bounds.left + (action.x || 0.5) * bounds.width;
                const targetY = bounds.top + (action.y || 0.5) * bounds.height;
                setCursorPosition({ x: targetX, y: targetY });
                const ok = await waitWithCancel(action.duration || 500);
                if (!ok) return;
            } else if (action.type === "hover") {
                // Show hover state with sound
                if (!isPlayingRef.current) return;
                setIsCursorHovering(true);
                setShowFocusOverlay(true);
                sounds.playHover();
                const ok = await waitWithCancel(duration || 600);
                if (!ok) return;
            } else if (action.type === "click") {
                // Perform click animation with sound
                if (!isPlayingRef.current) return;
                sounds.playClick();
                setIsCursorClicking(true);
                let ok = await waitWithCancel(180);
                if (!ok) return;
                setIsCursorClicking(false);
                ok = await waitWithCancel(250);
                if (!ok) return;
                setIsCursorHovering(false);
            } else if (action.type === "type") {
                // Simulate typing character by character with sound
                const text = action.text || "";
                const speed = action.speed || 140;
                setTypingText("");
                for (let i = 0; i <= text.length; i++) {
                    if (!isPlayingRef.current) return;
                    setTypingText(text.slice(0, i));
                    setSearchQuery(text.slice(0, i));
                    if (i > 0) sounds.playType();
                    const ok = await waitWithCancel(speed);
                    if (!ok) return;
                }
                const ok = await waitWithCancel(500);
                if (!ok) return;
            } else if (action.type === "scroll") {
                if (!isPlayingRef.current) return;
                setIsScrolling(true);
                if (scrollRef.current) {
                    scrollRef.current.scrollTo({ top: action.top || 150, behavior: "smooth" });
                }
                const ok = await waitWithCancel(duration || 500);
                if (!ok) return;
                setIsScrolling(false);
            } else if (action.type === "select") {
                // Show click before selection with sound
                if (!isPlayingRef.current) return;
                sounds.playClick();
                setIsCursorClicking(true);
                let ok = await waitWithCancel(200);
                if (!ok) return;
                setIsCursorClicking(false);

                sounds.playTransition();
                if (action.target === "service") {
                    const service = demoServices.find(s => s.id === action.id);
                    if (service) setSelectedService({ id: service.id, name: service.name, iconUrl: service.iconUrl });
                } else if (action.target === "country") {
                    setSelectedCountry(demoCountries.find(c => c.id === action.id) || null);
                } else if (action.target === "operator") {
                    setSelectedOperator(action.id);
                }
                setShowFocusOverlay(false);
                ok = await waitWithCancel(700);
                if (!ok) return;
            } else if (action.type === "copy") {
                if (!isPlayingRef.current) return;
                sounds.playClick();
                setIsCursorClicking(true);
                let ok = await waitWithCancel(200);
                if (!ok) return;
                setIsCursorClicking(false);

                sounds.playCopy();
                if (action.target === "number") {
                    setCopiedNumber(true);
                    setTimeout(() => setCopiedNumber(false), 2000);
                } else if (action.target === "code") {
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                }
                ok = await waitWithCancel(800);
                if (!ok) return;
            } else if (action.type === "focus") {
                // Show/hide focus overlay
                if (!isPlayingRef.current) return;
                setShowFocusOverlay(action.enabled !== false);
                const ok = await waitWithCancel(duration || 400);
                if (!ok) return;
            }

            // Update local step progress based on action index
            setProgress(((index + 1) / actions.length) * 100);
            if (isPlayingRef.current) runAction(index + 1);
        };

        runAction(currentActionIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, activeStep]); // Removed playerBounds - it changes too frequently during playback

    useEffect(() => {
        setProgress(0);
        setCurrentActionIndex(0);
        // Reset scroll position on step change
        if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 });
    }, [activeStep]);

    // Calculate global playback time string
    const getGlobalTotalDuration = () => demoSteps.reduce((acc, step: any) => acc + step.duration, 0);

    const getGlobalTime = () => {
        const totalDuration = getGlobalTotalDuration();
        const completedDuration = demoSteps.slice(0, activeStep).reduce((acc, step: any) => acc + step.duration, 0);
        const currentStepDuration = demoSteps[activeStep]?.duration || 0;
        const currentStepProgressSeconds = (progress / 100) * currentStepDuration;
        const totalElapsed = completedDuration + currentStepProgressSeconds;

        const mins = Math.floor(totalElapsed / 60);
        const secs = Math.floor(totalElapsed % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate global progress percentage (0-100)
    const getGlobalProgress = () => {
        const totalDuration = getGlobalTotalDuration();
        if (totalDuration === 0) return 0;
        const completedDuration = demoSteps.slice(0, activeStep).reduce((acc, step: any) => acc + step.duration, 0);
        const currentStepDuration = demoSteps[activeStep]?.duration || 0;
        const currentProgressSeconds = (progress / 100) * currentStepDuration;
        return ((completedDuration + currentProgressSeconds) / totalDuration) * 100;
    };

    const handleCopyCode = () => {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
    };

    // Filter and sort services based on search query and sort option
    const filteredServices = demoServices
        .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (sortOption === "price_asc") return a.lowestPrice - b.lowestPrice;
            if (sortOption === "stock_desc") return b.totalStock - a.totalStock;
            return 0; // relevance = original order
        });

    const handleServiceSelect = (serviceId: string) => {
        setIsPlaying(false);
        const service = demoServices.find(s => s.id === serviceId);
        if (service) {
            setSelectedService({ id: service.id, name: service.name, iconUrl: service.iconUrl });
            // Advanced automatically to next step in demo
            setActiveStep(1); // Step 2: Country
            setSearchQuery(""); // Reset search for next step
        }
    };

    const handleCountrySelect = (countryId: string) => {
        setIsPlaying(false);
        const country = demoCountries.find(c => c.id === countryId);
        if (country) {
            setSelectedCountry(country);
            // Advanced automatically to next step in demo
            setActiveStep(2); // Step 3: Provider
            setSearchQuery(""); // Reset search for next step
        }
    };

    // Animation variants matching buy page
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.02 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, scale: 0.8 },
        show: { opacity: 1, scale: 1 }
    };

    // Render Step 1 - Service Selection Grid (matching /dashboard/buy)
    const renderServiceGrid = () => (
        <div className="w-full h-full flex flex-col bg-[#0a0a0c] overflow-hidden">
            {/* Header - Matching BuyPageHeader */}
            <div className="sticky top-0 z-40 bg-[#0a0a0c]/95 backdrop-blur-xl border-b border-white/5 py-2 px-4 mt-3 md:mt-0 md:bg-[#0a0a0c]/80 md:border md:rounded-2xl md:px-5 md:py-3 mb-2 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
                {/* Top Row: Title + Wallet/Breadcrumbs */}
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5">
                        <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors -ml-1 group">
                            <ArrowLeft className="w-4 h-4 text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                        </button>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--neon-lime))] text-black text-xs font-bold shadow-[0_0_12px_hsl(var(--neon-lime)/0.4)]">
                                1
                            </span>
                            Select Service
                        </h2>
                    </div>

                    {/* Breadcrumbs (desktop only) + Wallet (mobile only) */}
                    <div className="flex items-center gap-3">
                        <div className="hidden md:flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-medium tracking-wide">
                            <span className="text-[hsl(var(--neon-lime))]">Service</span>
                            <span className="text-zinc-700">/</span>
                            <span className="text-zinc-500">Country</span>
                            <span className="text-zinc-700">/</span>
                            <span className="text-zinc-500">Details</span>
                        </div>
                        {/* Wallet - Mobile only */}
                        <div className="flex md:hidden items-center bg-zinc-900 rounded-full border border-white/5 px-2.5 py-1 gap-2">
                            <ShoppingCart className="h-3 w-3 text-[hsl(var(--neon-lime))]" />
                            <span className="text-[10px] sm:text-xs font-mono text-zinc-300">$10.58</span>
                        </div>
                    </div>
                </div>

                {/* Search Box */}
                <div className="relative w-full md:w-80 group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-zinc-500 group-focus-within:text-zinc-300 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full bg-[#0F0F11] border border-white/5 text-sm rounded-xl py-2.5 pl-10 pr-14 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/10 focus:bg-[#151518] focus:shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all font-medium"
                        value={searchQuery}
                        onChange={(e) => {
                            setIsPlaying(false);
                            setSearchQuery(e.target.value);
                        }}
                    />
                    {/* Sort Button */}
                    <div className="absolute inset-y-0 right-1.5 flex items-center">
                        <button
                            className={cn(
                                "p-2 rounded-xl transition-all duration-300 outline-none",
                                "text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95",
                                sortOption !== "relevance" && "text-[hsl(var(--neon-lime))] bg-[hsl(var(--neon-lime))/0.1]"
                            )}
                            type="button"
                            onClick={() => {
                                const options: ("relevance" | "price_asc" | "stock_desc")[] = ["relevance", "price_asc", "stock_desc"];
                                const currentIndex = options.indexOf(sortOption);
                                setSortOption(options[(currentIndex + 1) % options.length]);
                            }}
                        >
                            {sortOption === "relevance" && <TrendingUp className="w-4 h-4" strokeWidth={2} />}
                            {sortOption === "price_asc" && <DollarSign className="w-4 h-4" strokeWidth={2} />}
                            {sortOption === "stock_desc" && <Package className="w-4 h-4" strokeWidth={2} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Service Grid - Matching ServiceSelector */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-4">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 content-start"
                >
                    <AnimatePresence mode="popLayout">
                        {filteredServices.map((service, index) => {
                            const isSelected = selectedService?.id === service.id;
                            return (
                                <motion.button
                                    layout
                                    variants={itemVariants}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    key={`${service.id}_${index}`}
                                    onClick={() => handleServiceSelect(service.id)}
                                    className={cn(
                                        "relative flex flex-col items-center justify-center p-3 sm:p-4 aspect-square rounded-2xl border transition-all duration-300 group overflow-hidden",
                                        "backdrop-blur-sm shadow-lg",
                                        isSelected
                                            ? "bg-gradient-to-br from-[hsl(var(--neon-lime)/0.15)] via-[hsl(var(--neon-lime)/0.05)] to-transparent border-[hsl(var(--neon-lime))] shadow-[0_0_20px_hsl(var(--neon-lime)/0.25)]"
                                            : "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border-white/10 hover:border-white/30 hover:from-white/[0.12] hover:shadow-xl"
                                    )}
                                >
                                    {/* Active Badge */}
                                    {isSelected && (
                                        <div className="absolute top-1 right-1 z-20">
                                            <div className="w-4 h-4 rounded-full bg-[hsl(var(--neon-lime))] text-black flex items-center justify-center shadow-sm">
                                                <Check className="w-3 h-3" strokeWidth={3} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Icon Container */}
                                    <div className="relative z-10 mt-3 mb-2 w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
                                        {/* Hover glow ring */}
                                        <div className={cn(
                                            "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-500",
                                            "bg-gradient-to-br from-purple-500/20 via-blue-500/20 to-cyan-500/20",
                                            "blur-md scale-110 group-hover:scale-125"
                                        )} />

                                        {/* Icon */}
                                        <div className={cn(
                                            "relative w-full h-full rounded-xl overflow-hidden transition-all duration-300",
                                            "group-hover:scale-110 group-hover:rotate-2",
                                            isSelected && "ring-2 ring-[hsl(var(--neon-lime))] ring-offset-2 ring-offset-[#0a0a0c]"
                                        )}>
                                            <img
                                                src={service.iconUrl}
                                                alt={service.name}
                                                className={cn(
                                                    "w-full h-full object-contain filter transition-all",
                                                    "brightness-110 contrast-110",
                                                    !isSelected && "opacity-90 group-hover:opacity-100"
                                                )}
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(service.name)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`;
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Country Flags - Top Left */}
                                    {service.flags && service.flags.length > 0 && (
                                        <div className="absolute top-1.5 left-1.5 flex -space-x-1 opacity-60 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110 z-20">
                                            {service.flags.slice(0, 3).map((url, i) => (
                                                <div
                                                    key={i}
                                                    className="w-4 h-4 rounded-full border-2 border-[#151518] overflow-hidden bg-black/30 shadow-sm"
                                                    style={{ zIndex: 3 - i }}
                                                >
                                                    <img src={url} className="w-full h-full object-cover" alt="" />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Service Name */}
                                    <span className={cn(
                                        "text-[11px] sm:text-xs font-semibold text-center leading-tight line-clamp-2 w-full px-1 transition-colors",
                                        isSelected ? "text-white" : "text-gray-300 group-hover:text-white"
                                    )}>
                                        {service.name}
                                    </span>
                                </motion.button>
                            );
                        })}
                    </AnimatePresence>

                    {/* View All Services Card - Full Width */}
                    <Link href="/dashboard/buy" className="col-span-full">
                        <motion.div
                            variants={itemVariants}
                            className="flex items-center justify-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-white/20 hover:border-[hsl(var(--neon-lime)/0.5)] bg-gradient-to-r from-white/[0.03] via-white/[0.02] to-transparent hover:from-[hsl(var(--neon-lime)/0.05)] transition-all duration-300 group cursor-pointer"
                        >
                            <span className="text-sm font-semibold text-gray-400 group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                View All Services
                            </span>
                            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[hsl(var(--neon-lime))] transition-colors group-hover:translate-x-1 duration-300" />
                        </motion.div>
                    </Link>
                </motion.div>
            </div>
        </div>
    );

    // Render Step 2 - Country Selection (matching /dashboard/buy)
    const renderCountryGrid = () => (
        <div className="w-full h-full flex flex-col bg-[#0a0a0c] overflow-hidden">
            {/* Header - EXACT REPLICA OF BuyPageHeader */}
            <div className="sticky top-0 z-40 bg-[#0a0a0c]/95 backdrop-blur-xl border-b border-white/5 py-2 px-4 mt-3 md:mt-0 md:bg-[#0a0a0c]/80 md:border md:rounded-2xl md:px-5 md:py-3 mb-2 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5">
                        <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors -ml-1 group" onClick={() => setActiveStep(0)}>
                            <ArrowLeft className="w-4 h-4 text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                        </button>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--neon-lime))] text-black text-xs font-bold shadow-[0_0_12px_hsl(var(--neon-lime)/0.4)]">
                                2
                            </span>
                            Select Country
                        </h2>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Selected Service Icon (Matching BuyPageHeader) - Moved to left of breadcrumbs */}
                        <div className="relative flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[hsl(var(--neon-lime))] ring-offset-1 ring-offset-[#0a0a0c] shadow-[0_0_10px_hsl(var(--neon-lime)/0.25)] bg-zinc-900 animate-in zoom-in duration-300">
                            <img
                                src={selectedService?.iconUrl || "/placeholder-icon.png"}
                                alt="Service"
                                className="w-full h-full object-contain"
                            />
                        </div>

                        <div className="hidden md:flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-medium tracking-wide">
                            <span className="text-zinc-500">Service</span>
                            <span className="text-zinc-700">/</span>
                            <span className="text-[hsl(var(--neon-lime))]">Country</span>
                            <span className="text-zinc-700">/</span>
                            <span className="text-zinc-500">Details</span>
                        </div>
                    </div>
                </div>

                <div className="relative w-full md:w-80 group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-zinc-500 group-focus-within:text-zinc-300 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full bg-[#0F0F11] border border-white/5 text-sm rounded-xl py-2.5 pl-10 pr-14 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/10 focus:bg-[#151518] focus:shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all font-medium"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {/* Sort Button Mock */}
                    <div className="absolute inset-y-0 right-1.5 flex items-center">
                        <button
                            className={cn(
                                "p-2 rounded-xl transition-all duration-300 outline-none text-zinc-400 hover:text-white"
                            )}
                            type="button"
                        >
                            <TrendingUp className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Country Grid */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-3"
                >
                    <AnimatePresence mode="popLayout">
                        {demoCountries
                            .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map((country, index) => {
                                const isSelected = selectedCountry?.id === country.id;
                                return (
                                    <motion.div
                                        layout
                                        variants={itemVariants}
                                        key={country.id}
                                        onClick={() => handleCountrySelect(country.id)}
                                        className={cn(
                                            "relative flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all duration-300",
                                            "hover:shadow-2xl hover:-translate-y-1 group",
                                            isSelected
                                                ? "bg-gradient-to-br from-[hsl(var(--neon-lime)/0.08)] to-[hsl(var(--neon-lime)/0.02)] border-[hsl(var(--neon-lime)/0.4)] shadow-[0_0_20px_hsl(var(--neon-lime)/0.1)]"
                                                : "bg-gradient-to-br from-white/[0.04] to-white/[0.01] border-white/5 hover:border-white/25 hover:from-white/[0.08]"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-full overflow-hidden border-2 transition-all shrink-0",
                                            isSelected ? "border-[hsl(var(--neon-lime))]" : "border-white/10"
                                        )}>
                                            <img
                                                src={country.flagUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${country.code}`}
                                                className="w-full h-full object-cover"
                                                alt={country.name}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className={cn(
                                                "text-sm font-bold truncate transition-colors mb-0.5",
                                                isSelected ? "text-white" : "text-gray-200 group-hover:text-white"
                                            )}>
                                                {country.name}
                                            </h4>
                                            <div className={cn(
                                                "text-[10px] font-medium transition-colors",
                                                isSelected ? "text-emerald-400" : "text-zinc-500"
                                            )}>
                                                {country.totalStock >= 1000 ? `${(country.totalStock / 1000).toFixed(1)}K` : country.totalStock} available
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "shrink-0 text-right px-2.5 py-1.5 rounded-lg transition-colors",
                                            isSelected ? "bg-[hsl(var(--neon-lime)/0.1)]" : "bg-white/[0.03] group-hover:bg-white/[0.06]"
                                        )}>
                                            <div className="text-[8px] uppercase tracking-wider text-gray-500 font-medium leading-tight">From</div>
                                            <div className={cn(
                                                "text-sm font-bold tabular-nums leading-tight",
                                                isSelected ? "text-[hsl(var(--neon-lime))]" : "text-white group-hover:text-[hsl(var(--neon-lime))]"
                                            )}>${country.minPrice}</div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                    </AnimatePresence>

                    {/* Footer link */}
                    <div className="col-span-full pt-2">
                        <Link href="/dashboard/buy" className="flex items-center justify-center gap-2 text-xs font-semibold text-zinc-500 hover:text-[hsl(var(--neon-lime))] transition-colors">
                            View all 54 countries <ArrowRight className="w-3 h-3" />
                        </Link>
                    </div>
                </motion.div>
            </div>
        </div>
    );

    const renderSMSNumberCard = () => {
        const provider = demoOperators.find(o => o.id === selectedOperator) || demoOperators[0];
        return (
            <div className="relative bg-[#12141a] rounded-2xl border border-white/5 overflow-hidden shadow-2xl p-4 md:p-5">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

                <div className="relative z-10 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            <div className="relative w-10 h-10 ring-2 ring-[hsl(var(--neon-lime))] ring-offset-1 ring-offset-[#0a0a0c] rounded-lg overflow-hidden shadow-[0_0_12px_hsl(var(--neon-lime)/0.35)]">
                                <img src={selectedService?.iconUrl} alt="" className="w-full h-full object-contain filter brightness-110" />
                                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-[#151518] overflow-hidden">
                                    <img src={selectedCountry?.flagUrl} alt="" className="w-full h-full object-cover" />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl md:text-2xl font-mono font-bold text-white tracking-tight">+1 (555) 847-2903</h2>
                                    <button
                                        onClick={() => { setCopiedNumber(true); setTimeout(() => setCopiedNumber(false), 2000); }}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300",
                                            copiedNumber
                                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                : "bg-white/5 text-zinc-400 border border-white/5 hover:bg-white/10 hover:text-white"
                                        )}
                                    >
                                        {copiedNumber ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium mt-0.5">
                                    <span>{selectedCountry?.name}</span>
                                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                    <span className="text-[hsl(var(--neon-lime))]">{selectedService?.name}</span>
                                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                                    <span>{provider.displayName}</span>
                                </div>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inset-0 rounded-full bg-emerald-500 opacity-75"></span>
                                <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Active</span>
                        </div>
                    </div>

                    <div className="h-px bg-white/5 w-full" />

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between h-[72px]">
                            <p className="text-[10px] text-zinc-500 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                                <Timer className="w-3 h-3" /> Expires in
                            </p>
                            <p className="text-xl font-mono text-white">14:52</p>
                        </div>
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between h-[72px]">
                            <p className="text-[10px] text-zinc-500 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                                <MessageSquare className="w-3 h-3" /> Received
                            </p>
                            <p className="text-xl font-mono text-white">{activeStep >= 4 ? "1" : "0"}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderSMSMessageCard = () => {
        const serviceName = selectedService?.name || "Service";
        const fromLower = serviceName.toLowerCase();

        // Match production getServiceColor logic
        let colors = {
            bg: 'from-slate-500/15 to-gray-500/10',
            border: 'border-slate-500/20',
            icon: 'text-slate-400'
        };

        if (fromLower.includes('whatsapp')) {
            colors = { bg: 'from-green-500/15 to-emerald-500/10', border: 'border-green-500/20', icon: 'text-green-500' };
        } else if (fromLower.includes('google') || fromLower.includes('openai')) {
            colors = { bg: 'from-blue-500/15 to-cyan-500/10', border: 'border-blue-500/20', icon: 'text-blue-500' };
        } else if (fromLower.includes('telegram')) {
            colors = { bg: 'from-indigo-500/15 to-violet-500/10', border: 'border-indigo-500/20', icon: 'text-indigo-500' };
        } else if (fromLower.includes('facebook') || fromLower.includes('fb')) {
            colors = { bg: 'from-blue-600/15 to-blue-400/10', border: 'border-blue-500/20', icon: 'text-blue-400' };
        } else if (fromLower.includes('twitter') || fromLower.includes('x')) {
            colors = { bg: 'from-sky-500/15 to-cyan-500/10', border: 'border-sky-500/20', icon: 'text-sky-400' };
        }

        return (
            <motion.div
                initial={{ opacity: 0, x: 30, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                className="group"
            >
                <div className={cn(
                    "relative p-3 rounded-2xl bg-gradient-to-r border backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-opacity-60",
                    colors.bg,
                    colors.border
                )}>
                    {/* Shimmer on hover */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />

                    {/* Header */}
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                            <div className={cn("p-1.5 rounded-lg bg-black/20", colors.icon)}>
                                <MessageSquare className="h-3.5 w-3.5" />
                            </div>
                            <span className="text-xs font-medium text-white/80">{serviceName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                Just now
                            </span>
                        </div>
                    </div>

                    {/* Message Content */}
                    <p className="text-xs leading-relaxed text-gray-300 mb-2">
                        Your {serviceName} verification code is: 847293. Please do not share it with anyone.
                    </p>

                    {/* OTP Code Section */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between p-2 rounded-xl bg-black/30 border border-emerald-500/20"
                    >
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-emerald-500/20">
                                <Zap className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500">Code</p>
                                <p className="font-mono font-bold text-base tracking-[0.15em] text-emerald-400">
                                    847293
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleCopyCode}
                            className="h-8 gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-xs px-2.5 flex items-center transition-all"
                        >
                            {copiedCode ? (
                                <><Check className="h-3 w-3" /> Copied</>
                            ) : (
                                <><Copy className="h-3 w-3" /> Copy</>
                            )}
                        </button>
                    </motion.div>
                </div>
            </motion.div>
        );
    };

    const renderSMSInbox = () => (
        <div className="h-full flex flex-col">
            {/* Header Mirroring SMS Page */}
            <div className="bg-[#0a0a0c]/80 backdrop-blur-xl border-b border-white/5 py-4 px-5 flex items-center justify-between shadow-lg shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={() => setActiveStep(2)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors group">
                        <ArrowLeft className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-white flex items-center gap-2.5">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inset-0 rounded-full bg-[hsl(var(--neon-lime))] opacity-75"></span>
                                <span className="relative rounded-full h-2.5 w-2.5 bg-[hsl(var(--neon-lime))]"></span>
                            </span>
                            SMS Inbox
                        </h1>
                        <p className="text-[10px] text-zinc-500 font-medium">Real-time message viewer</p>
                    </div>
                </div>
                <div className="bg-zinc-900 rounded-full border border-white/5 px-3 py-1.5 flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-[hsl(var(--neon-lime))]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Secure Channel</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
                    <div className="space-y-4">
                        {renderSMSNumberCard()}
                    </div>

                    <div className="bg-[#0f1115]/50 border border-white/5 rounded-2xl p-6 min-h-[400px] flex flex-col">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <Inbox className="w-5 h-5 text-zinc-500" />
                                <h3 className="text-sm font-bold text-white">Received Messages</h3>
                                <div className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-zinc-400">{activeStep >= 4 ? "1" : "0"} New</div>
                            </div>
                        </div>

                        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
                            {activeStep === 3 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 relative">
                                        <Inbox className="w-6 h-6 text-zinc-600" />
                                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inset-0 rounded-full bg-emerald-500 opacity-75"></span>
                                            <span className="relative rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                        </span>
                                    </div>
                                    <h4 className="text-sm font-bold text-white mb-1">Waiting for Messages</h4>
                                    <p className="text-[10px] text-zinc-500 max-w-[200px]">We're listening for incoming SMS codes from {selectedService?.name}...</p>
                                </div>
                            ) : renderSMSMessageCard()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderProviderGrid = () => (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header Mirroring Dashboard BuyPageHeader */}
            <div className="bg-[#0a0a0c]/80 backdrop-blur-xl border-b border-white/5 py-4 px-5 flex items-center justify-between shadow-lg shrink-0">
                <div className="flex items-center gap-2.5">
                    <button onClick={() => setActiveStep(1)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors group">
                        <ArrowLeft className="w-4 h-4 text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                    </button>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--neon-lime))] text-black text-xs font-bold shadow-[0_0_12px_hsl(var(--neon-lime)/0.4)]">
                            3
                        </span>
                        Select Provider
                    </h2>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-1.5 text-[10px] font-medium tracking-wide">
                        <span className="text-zinc-500">Service</span>
                        <span className="text-zinc-700">/</span>
                        <span className="text-zinc-500">Country</span>
                        <span className="text-zinc-700">/</span>
                        <span className="text-[hsl(var(--neon-lime))]">Details</span>
                    </div>
                    <div className="relative flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[hsl(var(--neon-lime))] ring-offset-1 ring-offset-[#0a0a0c] shadow-[0_0_10px_hsl(var(--neon-lime)/0.25)] bg-zinc-900 animate-in zoom-in duration-300">
                        <img src={selectedService?.iconUrl || "/placeholder-icon.png"} alt="Service" className="w-full h-full object-contain" />
                    </div>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-4">
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AnimatePresence mode="popLayout">
                        {demoOperators.map((provider) => {
                            const isSelected = selectedOperator === provider.id;
                            return (
                                <motion.div
                                    layout
                                    variants={itemVariants}
                                    key={provider.id}
                                    onClick={() => {
                                        setIsPlaying(false);
                                        setSelectedOperator(provider.id);
                                    }}
                                    className={cn(
                                        "relative group cursor-pointer rounded-xl border p-3 transition-all duration-300 overflow-hidden",
                                        isSelected
                                            ? "bg-[hsl(var(--neon-lime)/0.05)] border-[hsl(var(--neon-lime)/0.5)] shadow-[0_0_30px_-10px_hsl(var(--neon-lime)/0.3)]"
                                            : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20"
                                    )}
                                >
                                    {isSelected && <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--neon-lime)/0.1)] to-transparent pointer-events-none" />}

                                    <div className="absolute top-3 right-3 flex gap-2">
                                        {provider.isBestPrice && (
                                            <div className="px-2 py-0.5 rounded-full bg-[hsl(var(--neon-lime))] text-black text-[10px] font-bold flex items-center gap-1">
                                                <Zap className="w-3 h-3 fill-black" /> BEST PRICE
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 mb-3 relative z-10">
                                        <div className="relative w-10 h-10 flex-shrink-0">
                                            <div className="w-full h-full rounded-lg overflow-hidden ring-2 ring-[hsl(var(--neon-lime))] ring-offset-1 ring-offset-[#0a0a0c] shadow-[0_0_8px_hsl(var(--neon-lime)/0.2)]">
                                                <img src={selectedService?.iconUrl || "/placeholder-icon.png"} alt="" className="w-full h-full object-contain" />
                                            </div>
                                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-[#151518] overflow-hidden">
                                                <img src={selectedCountry?.flagUrl} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h4 className={cn("font-bold text-sm truncate", isSelected ? "text-[hsl(var(--neon-lime))]" : "text-white")}>
                                                {provider.displayName}
                                            </h4>
                                            <p className="text-[10px] text-zinc-500 truncate">{selectedService?.name} • {selectedCountry?.name}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 relative z-10 mb-2">
                                        <div className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/5">
                                            <span className="text-[8px] text-zinc-500 uppercase tracking-wider block">Price</span>
                                            <span className="text-sm font-bold text-white">${provider.price}</span>
                                        </div>
                                        <div className="px-2 py-1.5 rounded-lg bg-black/40 border border-white/5">
                                            <span className="text-[8px] text-zinc-500 uppercase tracking-wider block">Success Rate</span>
                                            <span className="text-sm font-bold text-emerald-400">{provider.successRate}%</span>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {isSelected && (
                                            <motion.button
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                onClick={(e) => { e.stopPropagation(); setIsPlaying(false); setActiveStep(3); }}
                                                className="w-full py-2.5 rounded-lg bg-[hsl(var(--neon-lime))] text-black font-bold text-xs flex items-center justify-center gap-2 mt-2"
                                            >
                                                <ShoppingCart className="w-3.5 h-3.5 fill-black" />
                                                Purchase Number
                                            </motion.button>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />

            {/* Demo Cursor - visible during playback */}
            <DemoCursor
                position={cursorPosition}
                isClicking={isCursorClicking}
                isHovering={isCursorHovering}
                isVisible={isCursorVisible && isPlaying && !isMobile}
            />

            {/* Focus Overlay - spotlight effect - rendered inside player below */}
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

                    {/* Video Player Section */}
                    <section id="features" className="container mx-auto px-4 mb-12 lg:mb-20">
                        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="max-w-7xl mx-auto">

                            {isMobile ? (
                                <div className="space-y-4">
                                    {/* Main player card */}
                                    <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
                                        {/* Video area */}
                                        <div className="relative aspect-[3/4] bg-gradient-to-br from-[#1a1a1f] to-[#0d1f1f]">
                                            <AnimatePresence mode="wait">
                                                <motion.div key={activeStep} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                                                    {demoSteps[activeStep].preview.type === "services" && renderServiceGrid()}
                                                    {demoSteps[activeStep].preview.type === "countries" && renderCountryGrid()}
                                                    {demoSteps[activeStep].preview.type === "providers" && renderProviderGrid()}
                                                    {demoSteps[activeStep].preview.type === "number" && renderSMSInbox()}
                                                    {demoSteps[activeStep].preview.type === "sms" && renderSMSInbox()}
                                                    {demoSteps[activeStep].preview.type === "success" && (
                                                        <div className="h-full flex items-center justify-center p-6">
                                                            <div className="text-center">
                                                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }} className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                                                    <CheckCircle2 className="w-10 h-10 text-green-400" />
                                                                </motion.div>
                                                                <p className="text-lg font-bold text-white mb-1">Verification Complete!</p>
                                                                <p className="text-gray-400 text-sm">Account successfully verified</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            </AnimatePresence>
                                        </div>

                                        {/* Controls */}
                                        <div className="p-4 bg-black/40">
                                            <div className="h-1 bg-white/10 rounded-full mb-4 overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-[hsl(var(--neon-lime))] rounded-full"
                                                    style={{ width: `${getGlobalProgress()}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => { setIsPlaying(false); setActiveStep(s => s > 0 ? s - 1 : demoSteps.length - 1); }} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><SkipBack className="w-4 h-4 text-white" /></button>
                                                    <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 rounded-full bg-[hsl(var(--neon-lime))] flex items-center justify-center">
                                                        {isPlaying ? <Pause className="w-5 h-5 text-black" /> : <Play className="w-5 h-5 text-black ml-0.5" />}
                                                    </button>
                                                    <button onClick={() => { setIsPlaying(false); setActiveStep(s => (s + 1) % demoSteps.length); }} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><SkipForward className="w-4 h-4 text-white" /></button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white/60 text-xs font-mono">{getGlobalTime()} / 1:05</span>
                                                    <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><Maximize className="w-3.5 h-3.5 text-white" /></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Step cards */}
                                    <div className="space-y-2">
                                        {demoSteps.map((step, i) => (
                                            <motion.button key={step.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} onClick={() => { setIsPlaying(false); resetStepData(); setActiveStep(i); }}
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
                                <div className="grid lg:grid-cols-10 gap-8">
                                    <div className="lg:col-span-7">
                                        <div ref={playerRef} className="relative aspect-video rounded-3xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 100px hsl(75,100%,50%,0.03)" }}>
                                            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1f] to-[#0d1f1f]">
                                                <AnimatePresence mode="wait">
                                                    <motion.div
                                                        key={activeStep}
                                                        initial={{ opacity: 0, filter: "blur(8px)", scale: 0.98 }}
                                                        animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                                                        exit={{ opacity: 0, filter: "blur(8px)", scale: 1.02 }}
                                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                                        className="absolute inset-0"
                                                    >
                                                        {demoSteps[activeStep]?.preview.type === "services" && renderServiceGrid()}
                                                        {demoSteps[activeStep]?.preview.type === "countries" && renderCountryGrid()}
                                                        {demoSteps[activeStep]?.preview.type === "providers" && renderProviderGrid()}
                                                        {demoSteps[activeStep]?.preview.type === "number" && renderSMSInbox()}
                                                        {demoSteps[activeStep]?.preview.type === "sms" && renderSMSInbox()}
                                                        {demoSteps[activeStep]?.preview.type === "success" && (
                                                            <div className="h-full flex items-center justify-center p-8">
                                                                <div className="text-center">
                                                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                                                                        <CheckCircle2 className="w-12 h-12 text-green-400" />
                                                                    </motion.div>
                                                                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-2xl font-bold text-white mb-2">Verification Complete!</motion.p>
                                                                    <p className="text-gray-400">Account successfully verified</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>

                                            {/* Focus Overlay - spotlight effect - constrained to player */}
                                            <FocusOverlay
                                                isActive={showFocusOverlay && isPlaying && !isMobile}
                                                targetPosition={cursorPosition}
                                                playerBounds={playerBounds}
                                            />

                                            {/* Premium controls */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6">
                                                <div className="flex items-center gap-4 mb-4">
                                                    <span className="text-white text-sm font-mono font-bold tracking-wider w-12 text-center">{getGlobalTime()}</span>
                                                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer group relative">
                                                        <motion.div
                                                            className="h-full bg-gradient-to-r from-[hsl(var(--neon-lime))] to-[hsl(75,100%,60%)] rounded-full relative"
                                                            style={{ width: `${getGlobalProgress()}%` }}
                                                        >
                                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_15px_white] opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </motion.div>
                                                    </div>
                                                    <span className="text-white/40 text-sm font-mono font-bold tracking-wider w-12 text-center">1:05</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => { setIsPlaying(false); resetStepData(); setActiveStep(s => s > 0 ? s - 1 : demoSteps.length - 1); }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><SkipBack className="w-4 h-4 text-white" /></button>
                                                        <button onClick={() => setIsPlaying(!isPlaying)} className="w-14 h-14 rounded-full bg-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime-soft))] flex items-center justify-center transition-all shadow-lg shadow-[hsl(var(--neon-lime)/0.3)]">
                                                            {isPlaying ? <Pause className="w-6 h-6 text-black" /> : <Play className="w-6 h-6 text-black ml-1" />}
                                                        </button>
                                                        <button onClick={() => { setIsPlaying(false); resetStepData(); setActiveStep(s => (s + 1) % demoSteps.length); }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"><SkipForward className="w-4 h-4 text-white" /></button>
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

                                    <div className="lg:col-span-3 space-y-3">
                                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-2">Demo Steps</p>
                                        {demoSteps.map((step, i) => (
                                            <button key={step.id} onClick={() => { setIsPlaying(false); resetStepData(); setActiveStep(i); }} className={`w-full p-4 rounded-xl text-left transition-all group ${activeStep === i ? "bg-white/[0.06] border border-[hsl(var(--neon-lime)/0.3)]" : "bg-transparent hover:bg-white/[0.03] border border-transparent"}`}>
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
