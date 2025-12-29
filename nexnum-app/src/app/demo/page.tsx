"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, ArrowLeft, Play, CheckCircle2, ArrowRight, Shield, Clock, Globe } from "lucide-react";
import { useState } from "react";

export default function DemoPage() {
    const [isPlaying, setIsPlaying] = useState(false);

    const features = [
        {
            icon: Clock,
            title: "Instant Activation",
            description: "Get your virtual number in seconds, no waiting required."
        },
        {
            icon: Globe,
            title: "50+ Countries",
            description: "Access numbers from over 50 countries worldwide."
        },
        {
            icon: Shield,
            title: "Privacy First",
            description: "Your real number stays private and secure."
        }
    ];

    return (
        <main className="min-h-screen bg-gradient-to-br from-[#0a0a0c] via-[#0d1f1f] to-[#0a0a0c] px-4 py-12 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[hsl(var(--neon-lime)/0.06)] blur-[150px]" />
                <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-[hsl(180,50%,12%,0.2)] blur-[100px]" />
            </div>

            <div className="container mx-auto max-w-6xl relative z-10">
                {/* Back to home */}
                <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 text-sm">
                    <ArrowLeft className="w-4 h-4" />
                    Back to home
                </Link>

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-12"
                >
                    <div className="inline-flex items-center px-4 py-2 rounded-full border border-[hsl(var(--neon-lime)/0.4)] bg-[hsl(var(--neon-lime)/0.08)] backdrop-blur-sm mb-6">
                        <Play className="w-4 h-4 mr-2 text-[hsl(var(--neon-lime))]" />
                        <span className="text-sm font-medium text-[hsl(var(--neon-lime))]">Product Demo</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
                        See NexNum in Action
                    </h1>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                        Watch how easy it is to get virtual numbers for SMS verification in just a few clicks.
                    </p>
                </motion.div>

                {/* Video Player */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mb-16"
                >
                    <div
                        className="relative aspect-video rounded-3xl overflow-hidden bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10 shadow-2xl cursor-pointer group"
                        onClick={() => setIsPlaying(!isPlaying)}
                    >
                        {/* Placeholder/thumbnail */}
                        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1f] via-[#151518] to-[#0d1f1f]">
                            {/* Phone mockup preview */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-48 md:w-64 h-auto aspect-[9/19] rounded-3xl bg-gradient-to-b from-[#2a2a30] to-[#1a1a1f] border-4 border-[#1f1f24] shadow-2xl">
                                    <div className="w-full h-full rounded-[20px] bg-gradient-to-b from-[#1a1a1f] to-[#0d1f1f] p-3 flex flex-col items-center justify-center">
                                        <Zap className="w-10 h-10 text-[hsl(var(--neon-lime))] mb-2" />
                                        <span className="text-white font-bold text-sm">NexNum</span>
                                        <span className="text-gray-500 text-xs">Virtual Numbers Pro</span>
                                    </div>
                                </div>
                            </div>

                            {/* Glow effect */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-[hsl(var(--neon-lime)/0.15)] blur-[80px]" />
                        </div>

                        {/* Play button */}
                        {!isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <motion.div
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-[hsl(var(--neon-lime))] flex items-center justify-center shadow-xl shadow-[hsl(var(--neon-lime)/0.4)] group-hover:shadow-2xl group-hover:shadow-[hsl(var(--neon-lime)/0.5)] transition-shadow"
                                >
                                    <Play className="w-8 h-8 md:w-10 md:h-10 text-black ml-1" fill="currentColor" />
                                </motion.div>
                            </div>
                        )}

                        {/* Video would go here when playing */}
                        {isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black">
                                <p className="text-gray-400">Demo video playing...</p>
                            </div>
                        )}

                        {/* Corner decorations */}
                        <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-[hsl(var(--neon-lime)/0.3)] rounded-tl-lg" />
                        <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-[hsl(var(--neon-lime)/0.3)] rounded-tr-lg" />
                        <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-[hsl(var(--neon-lime)/0.3)] rounded-bl-lg" />
                        <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-[hsl(var(--neon-lime)/0.3)] rounded-br-lg" />
                    </div>
                </motion.div>

                {/* Features highlight */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    className="grid md:grid-cols-3 gap-6 mb-16"
                >
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm"
                        >
                            <div className="w-12 h-12 rounded-xl bg-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center mb-4">
                                <feature.icon className="w-6 h-6 text-[hsl(var(--neon-lime))]" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                            <p className="text-gray-400 text-sm">{feature.description}</p>
                        </div>
                    ))}
                </motion.div>

                {/* CTA Section */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    className="text-center"
                >
                    <div className="bg-gradient-to-r from-white/[0.03] via-white/[0.05] to-white/[0.03] border border-white/[0.08] rounded-3xl p-8 md:p-12">
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                            Ready to get started?
                        </h2>
                        <p className="text-gray-400 mb-8 max-w-xl mx-auto">
                            Join thousands of users who trust NexNum for their verification needs.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link href="/register">
                                <Button
                                    size="lg"
                                    className="h-14 px-8 text-base font-bold bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime-soft))] neon-glow transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.25)]"
                                >
                                    Get Started Free <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                            <Link href="/login">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className="h-14 px-8 border-white/20 text-white hover:bg-white/5"
                                >
                                    Sign In
                                </Button>
                            </Link>
                        </div>

                        {/* Trust badges */}
                        <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-sm">
                            <div className="flex items-center gap-2 text-gray-400">
                                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--neon-lime))]" />
                                <span>No credit card required</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-400">
                                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--neon-lime))]" />
                                <span>Free trial included</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-400">
                                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--neon-lime))]" />
                                <span>Cancel anytime</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </main>
    );
}
