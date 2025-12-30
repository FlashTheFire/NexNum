"use client";

import { motion } from "framer-motion";

export default function BuyPageHero() {
    return (
        <section className="relative pt-8 pb-12 lg:pt-16 lg:pb-16 text-center">
            <div className="relative z-10 max-w-3xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(var(--neon-lime)/0.1)] border border-[hsl(var(--neon-lime)/0.2)] text-[hsl(var(--neon-lime))] text-xs font-bold tracking-wide uppercase mb-6">
                        <span className="w-2 h-2 rounded-full bg-[hsl(var(--neon-lime))] animate-pulse" />
                        Live Inventory
                    </div>
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-tight text-white">
                        Get Your <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(var(--neon-lime))] to-emerald-400">
                            Private Number
                        </span>
                    </h1>
                    <p className="text-lg text-gray-400 mb-8 max-w-lg mx-auto leading-relaxed">
                        Select from valid numbers across 50+ countries.
                        Receive SMS instantly for WhatsApp, Telegram, Google, and more.
                    </p>
                </motion.div>
            </div>

            {/* Background Glow - Centered */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl bg-[radial-gradient(circle_at_center,hsl(var(--neon-lime)/0.08),transparent_70%)] blur-3xl pointer-events-none" />
        </section>
    );
}
