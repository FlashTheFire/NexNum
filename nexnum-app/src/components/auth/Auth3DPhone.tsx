"use client";

import { motion } from "framer-motion";

interface Auth3DPhoneProps {
    className?: string;
}

export default function Auth3DPhone({ className = "" }: Auth3DPhoneProps) {
    return (
        <motion.div
            className={`relative ${className}`}
            initial={{ opacity: 0, rotateY: -20 }}
            animate={{ opacity: 1, rotateY: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            style={{ perspective: "1200px" }}
        >
            {/* 3D Phone container */}
            <motion.div
                className="relative"
                style={{ transformStyle: "preserve-3d" }}
                animate={{
                    rotateY: [-5, 5, -5],
                    rotateX: [2, -2, 2]
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            >
                {/* Phone glow */}
                <div
                    className="absolute -inset-10 rounded-[60px] blur-3xl"
                    style={{
                        background: "radial-gradient(circle, hsl(75,100%,50%,0.15) 0%, transparent 70%)"
                    }}
                />

                {/* Phone frame */}
                <div
                    className="relative w-[280px] h-[560px] rounded-[50px] p-[3px]"
                    style={{
                        background: "linear-gradient(145deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.2) 100%)",
                        boxShadow: `
                            0 50px 100px -20px rgba(0,0,0,0.7),
                            0 30px 60px -30px rgba(0,0,0,0.5),
                            inset 0 1px 0 rgba(255,255,255,0.1),
                            0 0 80px hsl(75,100%,50%,0.1)
                        `,
                        transform: "translateZ(20px)"
                    }}
                >
                    {/* Inner frame */}
                    <div
                        className="w-full h-full rounded-[47px] overflow-hidden"
                        style={{
                            background: "linear-gradient(180deg, #1a1a1f 0%, #0d0d10 100%)"
                        }}
                    >
                        {/* Screen */}
                        <div className="relative w-full h-full bg-gradient-to-b from-[#0a1a1a] via-[#0d1515] to-[#0a1a1a] p-4">
                            {/* Dynamic Island */}
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full flex items-center justify-center gap-2 z-20">
                                <div className="w-2.5 h-2.5 rounded-full bg-gray-800 relative">
                                    <div className="absolute inset-0.5 rounded-full bg-gray-900">
                                        <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 rounded-full bg-blue-400/30" />
                                    </div>
                                </div>
                            </div>

                            {/* Status bar */}
                            <div className="absolute top-5 left-8 right-8 flex items-center justify-between text-white/60 text-[10px] z-10">
                                <span className="font-medium">9:41</span>
                                <div className="flex items-center gap-1">
                                    <div className="flex items-end gap-[2px] h-2.5">
                                        <div className="w-[3px] h-1 bg-white/60 rounded-sm" />
                                        <div className="w-[3px] h-1.5 bg-white/60 rounded-sm" />
                                        <div className="w-[3px] h-2 bg-white/60 rounded-sm" />
                                        <div className="w-[3px] h-2.5 bg-white/60 rounded-sm" />
                                    </div>
                                    <div className="w-5 h-2.5 border border-white/60 rounded-sm ml-1 relative">
                                        <div className="absolute inset-0.5 bg-[hsl(var(--neon-lime))] rounded-[1px]" style={{ width: "70%" }} />
                                    </div>
                                </div>
                            </div>

                            {/* App content */}
                            <div className="mt-16 space-y-4">
                                {/* App header */}
                                <div className="text-center mb-6">
                                    <motion.div
                                        className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.3)] to-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center mb-3"
                                        animate={{ scale: [1, 1.05, 1] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        style={{ boxShadow: "0 0 30px hsl(75,100%,50%,0.2)" }}
                                    >
                                        <svg className="w-7 h-7 text-[hsl(var(--neon-lime))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                        </svg>
                                    </motion.div>
                                    <p className="text-white text-sm font-semibold">NexNum</p>
                                    <p className="text-gray-500 text-[10px]">Virtual Numbers</p>
                                </div>

                                {/* Verification card */}
                                <motion.div
                                    className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06]"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                                            <span className="text-blue-400 text-xs">G</span>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-white text-xs font-medium">Google Verification</p>
                                            <p className="text-gray-500 text-[10px]">Just now</p>
                                        </div>
                                    </div>
                                    <p className="text-gray-400 text-[11px] mb-3">Your code is: <span className="text-[hsl(var(--neon-lime))] font-mono font-bold">847293</span></p>
                                    <motion.div
                                        className="w-full h-8 rounded-lg bg-[hsl(var(--neon-lime)/0.1)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center"
                                        animate={{ opacity: [0.7, 1, 0.7] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                    >
                                        <span className="text-[hsl(var(--neon-lime))] text-xs font-medium">Copy Code</span>
                                    </motion.div>
                                </motion.div>

                                {/* Stats row */}
                                <div className="grid grid-cols-3 gap-2 mt-4">
                                    {[
                                        { label: "Numbers", value: "12" },
                                        { label: "Messages", value: "48" },
                                        { label: "Success", value: "99%" }
                                    ].map((stat, i) => (
                                        <motion.div
                                            key={i}
                                            className="bg-white/[0.03] rounded-xl p-2 text-center"
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.7 + i * 0.1 }}
                                        >
                                            <p className="text-white text-sm font-bold">{stat.value}</p>
                                            <p className="text-gray-500 text-[9px]">{stat.label}</p>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Active number */}
                                <motion.div
                                    className="bg-gradient-to-r from-[hsl(var(--neon-lime)/0.08)] to-transparent rounded-xl p-3 border-l-2 border-[hsl(var(--neon-lime))]"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 1 }}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-white text-xs font-medium">+1 (555) 847-2903</p>
                                            <p className="text-gray-500 text-[10px]">🇺🇸 United States</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                            <span className="text-green-400 text-[10px]">Active</span>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>

                            {/* Bottom bar */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/30 rounded-full" />
                        </div>
                    </div>
                </div>

                {/* Phone side (3D depth) */}
                <div
                    className="absolute top-2 -right-[4px] w-[4px] h-[556px] rounded-r-lg"
                    style={{
                        background: "linear-gradient(180deg, rgba(60,60,60,0.8) 0%, rgba(30,30,30,0.9) 100%)",
                        transform: "rotateY(90deg) translateZ(138px)"
                    }}
                />

                {/* Buttons */}
                <div className="absolute left-[-4px] top-28 w-[4px] h-8 bg-gray-700 rounded-l-sm" />
                <div className="absolute left-[-4px] top-40 w-[4px] h-14 bg-gray-700 rounded-l-sm" />
                <div className="absolute left-[-4px] top-56 w-[4px] h-14 bg-gray-700 rounded-l-sm" />
                <div className="absolute right-[-4px] top-36 w-[4px] h-16 bg-gray-700 rounded-r-sm" />
            </motion.div>
        </motion.div>
    );
}
