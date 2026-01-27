"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Zap, MessageSquare, CheckCircle2, Timer } from "lucide-react";

export default function Auth3DLaptop() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40, rotateX: 10 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 1, delay: 0.3, type: "spring" }}
            className="relative"
            style={{ perspective: "1500px" }}
        >
            {/* Laptop container */}
            <div
                className="relative"
                style={{
                    transform: "rotateY(15deg) rotateX(8deg) rotateZ(-2deg)",
                    transformStyle: "preserve-3d"
                }}
            >
                {/* Screen */}
                <div className="relative w-[480px] xl:w-[560px]">
                    {/* Screen back edge (3D depth) */}
                    <div
                        className="absolute -top-2 -left-1 -right-1 h-full rounded-t-2xl"
                        style={{
                            background: "linear-gradient(180deg, #0a0a0c 0%, #151518 100%)",
                            transform: "translateZ(-8px)",
                            boxShadow: "-5px 0 15px rgba(0,0,0,0.5)"
                        }}
                    />

                    {/* Screen bezel */}
                    <div
                        className="relative rounded-t-2xl overflow-hidden"
                        style={{
                            background: "linear-gradient(145deg, #2a2a2f 0%, #18181c 50%, #0c0c0f 100%)",
                            padding: "14px 14px 0 14px",
                            boxShadow: `
                                inset 3px 3px 6px rgba(255,255,255,0.05),
                                inset -2px -2px 4px rgba(0,0,0,0.6),
                                0 -15px 50px rgba(0,0,0,0.4),
                                5px 10px 40px rgba(0,0,0,0.5)
                            `,
                            transform: "translateZ(0px)"
                        }}
                    >
                        {/* Camera */}
                        <div className="absolute top-[6px] left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
                            <div
                                className="w-2.5 h-2.5 rounded-full flex items-center justify-center"
                                style={{
                                    background: "linear-gradient(145deg, #3a3a40 0%, #1a1a1f 100%)",
                                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)"
                                }}
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-900 ring-1 ring-gray-700" />
                            </div>
                        </div>

                        {/* Screen content */}
                        <div
                            className="relative rounded-t-lg overflow-hidden aspect-[16/10]"
                            style={{
                                background: "linear-gradient(135deg, #0d1f1f 0%, #0a0a0c 50%, #0d1417 100%)",
                                boxShadow: "inset 0 0 30px rgba(0,0,0,0.8)"
                            }}
                        >
                            {/* Dashboard UI */}
                            <div className="absolute inset-0 p-4">
                                {/* Top bar */}
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(var(--neon-lime)/0.3)] to-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center">
                                            <Image
                                                src="/assets/brand/nexnum-logo.svg"
                                                alt="NexNum"
                                                width={18}
                                                height={18}
                                            />
                                        </div>
                                        <div>
                                            <div className="text-white text-xs font-bold">NexNum Dashboard</div>
                                            <div className="text-gray-500 text-[8px]">Virtual Numbers Pro</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                        <span className="text-green-400 text-[9px]">Online</span>
                                    </div>
                                </div>

                                {/* Grid layout */}
                                <div className="grid grid-cols-3 gap-3">
                                    {/* Balance card */}
                                    <div className="col-span-2 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                                        <div className="text-gray-400 text-[8px] mb-1">Available Balance</div>
                                        <div className="text-xl font-bold text-[hsl(var(--neon-lime))]">$247.50</div>
                                        <div className="text-gray-500 text-[8px]">≈ 124 verifications</div>
                                    </div>

                                    {/* Stats card */}
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                                        <div className="text-gray-400 text-[8px] mb-1">Today</div>
                                        <div className="text-lg font-bold text-white">23</div>
                                        <div className="text-green-400 text-[8px]">+12%</div>
                                    </div>
                                </div>

                                {/* Active number */}
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 1.2 }}
                                    className="mt-3 p-3 rounded-xl bg-gradient-to-r from-[hsl(var(--neon-lime)/0.1)] to-transparent border border-[hsl(var(--neon-lime)/0.2)]"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-white text-xs font-medium">+1 (555) 847-2903</span>
                                                <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[7px]">Active</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">🇺🇸 USA</span>
                                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">WhatsApp</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-orange-400">
                                            <Timer className="w-3 h-3" />
                                            <span className="text-[9px]">12:45</span>
                                        </div>
                                    </div>
                                </motion.div>

                                {/* SMS notification */}
                                <motion.div
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 1.5 }}
                                    className="mt-3 p-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20"
                                >
                                    <div className="flex items-start gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                                            <MessageSquare className="w-3 h-3 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-white text-[9px] font-medium">Google Verification</span>
                                                <span className="text-gray-400 text-[7px]">now</span>
                                            </div>
                                            <p className="text-gray-300 text-[8px]">
                                                Your code is: <span className="font-mono font-bold text-[hsl(var(--neon-lime))]">847293</span>
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Success indicator */}
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 1.8 }}
                                    className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20"
                                >
                                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                                    <span className="text-green-400 text-[9px] font-medium">3 verifications completed today</span>
                                </motion.div>
                            </div>

                            {/* Screen glow */}
                            <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                    background: "radial-gradient(ellipse at 30% 20%, hsl(75,100%,50%,0.05) 0%, transparent 50%)"
                                }}
                            />
                        </div>
                    </div>

                    {/* Bottom bezel */}
                    <div
                        className="relative h-4 rounded-b-2xl"
                        style={{
                            background: "linear-gradient(180deg, #18181c 0%, #1f1f24 50%, #151518 100%)",
                            boxShadow: `
                                inset 0 1px 2px rgba(0,0,0,0.5),
                                0 8px 25px rgba(0,0,0,0.4)
                            `
                        }}
                    >
                        {/* Bottom edge highlight */}
                        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    </div>
                </div>

                {/* Tablet Kickstand - Behind tablet */}
                <div
                    className="absolute"
                    style={{
                        top: "5%",
                        left: "-3%",
                        width: "50%",
                        height: "90%",
                        transformOrigin: "center center",
                        transform: "translateZ(-80px) rotateY(-25deg) rotateX(7deg)",
                        zIndex: -10,
                    }}
                >
                    {/* Main kickstand plate */}
                    <div
                        className="absolute inset-0 rounded-xl"
                        style={{
                            background: "linear-gradient(180deg, #18181c 0%, #1f1f24 40%, #16161a 100%)",
                            boxShadow: `-20px 15px 40px rgba(0,0,0,0.7)`
                        }}
                    >
                        {/* Surface texture lines */}
                        <div className="absolute inset-6 opacity-[0.03]">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="h-px bg-white mb-4" />
                            ))}
                        </div>

                        {/* NexNum embossed logo */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]">
                            <div className="w-16 h-16 rounded-2xl border border-white/10 flex items-center justify-center">
                                <div className="w-8 h-8 rounded-xl bg-[hsl(var(--neon-lime)/0.15)]" />
                            </div>
                        </div>

                        {/* Edge highlight */}
                        <div className="absolute right-0 top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                    </div>
                </div>

                {/* Tablet reflection/shadow on surface */}
                <div
                    className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[90%] h-8"
                    style={{
                        background: "radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 70%)",
                        filter: "blur(8px)"
                    }}
                />

                {/* Neon glow accent */}
                <div
                    className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[60%] h-6 rounded-full"
                    style={{
                        background: "radial-gradient(ellipse at center, rgba(198,255,0,0.1) 0%, transparent 70%)",
                        filter: "blur(12px)"
                    }}
                />
            </div>
        </motion.div>
    );
}
