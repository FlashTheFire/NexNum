"use client";

import { useCurrency } from "@/providers/CurrencyProvider";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function CurrencySelector() {
    const { preferredCurrency, currencies, setCurrency, isLoading } = useCurrency();
    const [isOpen, setIsOpen] = useState(false);

    if (isLoading || !currencies || Object.keys(currencies).length === 0) return null;

    const currentCurrency = currencies[preferredCurrency] || Object.values(currencies)[0];

    return (
        <div
            className="relative"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-10 px-3.5 gap-2 text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-xl transition-all border border-white/[0.08] bg-white/[0.03] shadow-sm",
                            isOpen && "border-white/20 bg-white/[0.06]"
                        )}
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        <div className="flex items-center justify-center w-5 h-5 rounded flex-shrink-0 bg-white/5 border border-white/10">
                            <span className="text-[11px] font-bold text-white">
                                {currentCurrency.symbol}
                            </span>
                        </div>
                        <span className="text-sm font-bold text-gray-200">
                            {currentCurrency.code}
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    className="w-48 bg-[#0d0d12]/95 backdrop-blur-xl border-white/[0.08] p-1.5 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                >
                    {Object.values(currencies).map((cur) => (
                        <DropdownMenuItem
                            key={cur.code}
                            onClick={() => {
                                setCurrency(cur.code);
                                setIsOpen(false);
                            }}
                            className={cn(
                                "flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all mb-1 last:mb-0",
                                preferredCurrency === cur.code
                                    ? "bg-[hsl(var(--neon-lime))/0.1] text-[hsl(var(--neon-lime))]"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <div className="flex flex-col">
                                <span className="text-xs font-bold leading-none flex items-center gap-2">
                                    <span>{cur.code}</span>
                                    <span className="opacity-50 text-[10px] font-normal">({cur.symbol})</span>
                                </span>
                                <span className="text-[10px] opacity-40 mt-1">{cur.name}</span>
                            </div>
                            {preferredCurrency === cur.code && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                >
                                    <Check className="w-3.5 h-3.5" />
                                </motion.div>
                            )}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
