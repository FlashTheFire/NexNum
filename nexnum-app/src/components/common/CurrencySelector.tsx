"use client";

import { useCurrency } from "@/providers/CurrencyProvider";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, DollarSign, Euro, CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/utils/utils";

export default function CurrencySelector() {
    const { preferredCurrency, currencies, setCurrency, isLoading } = useCurrency();
    const [isOpen, setIsOpen] = useState(false);

    if (isLoading || !currencies || Object.keys(currencies).length === 0) return null;

    const currentCurrency = currencies[preferredCurrency] || { symbol: "$", code: "USD", name: "US Dollar" };

    return (
        <div
            className="relative"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            {/* Trigger Button - Circular like Language Selector */}
            <button
                className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300",
                    "hover:bg-white/[0.08] active:scale-95",
                    isOpen ? "bg-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.1)]" : "bg-transparent"
                )}
                aria-label="Select Currency"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/5 border border-white/10 filter drop-shadow-lg scale-110">
                    <span className="text-[10px] font-bold text-white">
                        {currentCurrency.symbol}
                    </span>
                </div>
            </button>

            {/* Dropdown menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute right-0 top-full mt-2 w-48 p-1.5 bg-[#0a0a0c]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl z-50 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar relative">
                            {Object.values(currencies).map((cur, index) => (
                                <motion.button
                                    key={cur.code}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    onClick={() => {
                                        setCurrency(cur.code);
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden",
                                        preferredCurrency === cur.code
                                            ? "bg-white/[0.08] text-white"
                                            : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                                    )}
                                >
                                    <div className="flex items-center gap-3 relative z-10">
                                        <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                            <span className="text-[10px] font-bold">{cur.symbol}</span>
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="text-xs font-bold leading-none flex items-center gap-1.5">
                                                <span>{cur.code}</span>
                                            </span>
                                            <span className="text-[10px] opacity-50 mt-1">{cur.name}</span>
                                        </div>
                                    </div>

                                    {preferredCurrency === cur.code && (
                                        <motion.div
                                            layoutId="activeCurrency"
                                            className="relative z-10"
                                        >
                                            <Check className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                                        </motion.div>
                                    )}

                                    {/* Hover glow effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
