"use client"

import { motion } from "framer-motion"
import { Battery, Signal, Wifi } from "lucide-react"

export function PhoneMockup() {
    return (
        <div className="relative w-[280px] h-[580px] perspective-1000 mx-auto transform-gpu">
            <motion.div
                initial={{ rotateY: -20, rotateX: 10 }}
                animate={{
                    rotateY: [-20, -5, -20],
                    rotateX: [10, 5, 10],
                    y: [0, -15, 0]
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
                className="w-full h-full relative preserve-3d"
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* Phone Frame */}
                <div className="absolute inset-0 bg-[#121212] rounded-[48px] border-[8px] border-[#2a2a2a] shadow-2xl overflow-hidden backface-hidden">
                    {/* Screen Content */}
                    <div className="w-full h-full bg-[#0a0a0c] relative overflow-hidden">

                        {/* Status Bar */}
                        <div className="absolute top-0 inset-x-0 h-14 px-6 flex items-center justify-between z-20">
                            <span className="text-xs font-medium text-white">9:41</span>
                            <div className="flex items-center gap-1.5 opacity-80">
                                <Signal className="h-3.5 w-3.5 text-white" />
                                <Wifi className="h-3.5 w-3.5 text-white" />
                                <Battery className="h-3.5 w-3.5 text-white" />
                            </div>
                        </div>

                        {/* Notch */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-7 w-32 bg-[#121212] rounded-b-2xl z-20" />

                        {/* UI Elements */}
                        <div className="pt-20 px-6 space-y-6">
                            {/* Greeting */}
                            <div>
                                <div className="h-2 w-20 bg-gray-800 rounded-full mb-2" />
                                <div className="h-8 w-32 bg-gray-800 rounded-lg animate-pulse" />
                            </div>

                            {/* Card */}
                            <div className="w-full aspect-video rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.2)] to-transparent border border-[hsl(var(--neon-lime)/0.2)] p-4 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                                <div className="flex justify-between items-start mb-6">
                                    <div className="h-8 w-8 rounded-full bg-[hsl(var(--neon-lime))]" />
                                    <div className="h-4 w-12 bg-white/10 rounded" />
                                </div>
                                <div className="h-6 w-24 bg-white/20 rounded mb-2" />
                                <div className="h-4 w-16 bg-white/10 rounded" />
                            </div>

                            {/* List Items */}
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                        <div className="w-10 h-10 rounded-full bg-white/10" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3 w-20 bg-white/10 rounded" />
                                            <div className="h-2 w-12 bg-white/5 rounded" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Navigation Bar */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/20 rounded-full" />
                    </div>

                    {/* Reflection/Glass Glare */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.05] to-transparent pointer-events-none z-30" />
                </div>

                {/* Depth/Sides (Simple CSS 3D approximation) */}
                <div className="absolute inset-0 rounded-[48px] bg-[#222] transform translate-z-[-5px]" />
                <div className="absolute inset-0 rounded-[48px] bg-[#000] transform translate-z-[-10px] shadow-[0_0_50px_rgba(0,0,0,0.5)]" />
            </motion.div>
        </div>
    )
}
