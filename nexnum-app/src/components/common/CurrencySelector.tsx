"use client";

import { useCurrency } from "@/providers/CurrencyProvider";
import { useRouter } from "@/i18n/navigation";
import { useTransition, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Globe, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/utils";

interface Props {
    compact?: boolean;
}

export default function CurrencySelector({ compact }: Props) {
    const { preferredCurrency, currencies, setCurrency, isLoading } = useCurrency();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(false);

    // Provider now guarantees currencies are available
    if (isLoading && (!currencies || Object.keys(currencies).length === 0)) return null;

    const currentCode = preferredCurrency || 'USD';
    const currentCurrency = currencies[currentCode] || Object.values(currencies)[0];

    return (
        <div
            className="relative"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            {/* Trigger Button */}
            <button
                className={cn(
                    "flex items-center gap-2 h-10 px-3.5 rounded-full transition-all duration-300 border border-white/[0.05]",
                    "hover:bg-white/[0.08] active:scale-95 bg-white/[0.03]",
                    isOpen ? "bg-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.1)] border-white/20" : ""
                )}
                aria-label="Select Currency"
                onClick={() => setIsOpen(!isOpen)}
            >
                {!compact}
                <span className="text-xs font-mono font-bold text-gray-200">
                    {currentCurrency?.code}
                </span>
                <ChevronDown className={cn(
                    "w-3 h-3 text-gray-500 transition-transform duration-300",
                    isOpen ? "rotate-180" : ""
                )} />
            </button>

            {/* Dropdown */}
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
                            {Object.values(currencies).map((cur: any, index: number) => (
                                <motion.button
                                    key={cur.code}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    onClick={() => {
                                        setCurrency(cur.code);
                                        setIsOpen(false);
                                        startTransition(() => {
                                            router.refresh();
                                        });
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden mb-1 last:mb-0",
                                        currentCode === cur.code
                                            ? "bg-white/[0.08] text-white"
                                            : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                                    )}
                                >
                                    <div className="flex flex-col items-start relative z-10">
                                        <span className="text-xs font-bold leading-none flex items-center gap-2">
                                            <span>{cur.code}</span>
                                            <span className="opacity-50 text-[10px] font-normal">({cur.symbol})</span>
                                        </span>
                                        <span className="text-[10px] opacity-40 mt-1 text-left line-clamp-1">{cur.name}</span>
                                    </div>

                                    {currentCode === cur.code && (
                                        <motion.div
                                            layoutId="activeCurrency"
                                            className="relative z-10"
                                        >
                                            <Check className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" />
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
