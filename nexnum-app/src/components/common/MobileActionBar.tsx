"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, CreditCard, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

export default function MobileActionBar() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            // Show bar after user scrolls down 300px
            setIsVisible(window.scrollY > 300);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed bottom-6 left-4 right-4 z-[100] lg:hidden"
                >
                    <div className="bg-[#0a0a0c]/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 shadow-2xl shadow-black/40 flex items-center justify-between gap-4">
                        {/* Quick Links */}
                        <div className="flex items-center gap-1 pl-1">
                            <Link href="#pricing" className="p-2.5 rounded-xl hover:bg-white/5 transition-colors group">
                                <CreditCard className="w-5 h-5 text-gray-400 group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                            </Link>
                            <Link href="/help" className="p-2.5 rounded-xl hover:bg-white/5 transition-colors group">
                                <HelpCircle className="w-5 h-5 text-gray-400 group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                            </Link>
                        </div>

                        {/* Main CTA */}
                        <Link href="/register" className="flex-1">
                            <Button
                                className="w-full bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)] font-bold h-12 rounded-xl shadow-[0_0_20px_rgba(198,255,0,0.2)]"
                            >
                                Get Started
                                <Zap className="w-4 h-4 ml-2 fill-current" />
                            </Button>
                        </Link>
                    </div>

                    {/* Bottom safety glow */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1/2 h-4 bg-[hsl(var(--neon-lime)/0.15)] blur-xl pointer-events-none" />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
