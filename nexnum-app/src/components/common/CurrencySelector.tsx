"use client";

import { useCurrency } from "@/hooks/use-currency";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Globe, Check, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";

export default function CurrencySelector() {
    const { currency, currencies, setCurrency, isLoading } = useCurrency();

    if (isLoading || currencies.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 gap-2 text-gray-400 hover:text-white hover:bg-white/[0.06] rounded-full transition-all border border-white/5"
                >
                    <Globe className="w-4 h-4" />
                    <span className="text-xs font-mono font-bold">{currency.code}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-40 bg-[#0d0d12]/95 backdrop-blur-xl border-white/[0.08] p-1 rounded-2xl shadow-2xl"
            >
                {currencies.map((cur) => (
                    <DropdownMenuItem
                        key={cur.code}
                        onClick={() => setCurrency(cur.code)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-not-allowed transition-all ${currency.code === cur.code
                                ? "bg-[hsl(var(--neon-lime))/0.1] text-[hsl(var(--neon-lime))]"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                            }`}
                    >
                        <div className="flex flex-col">
                            <span className="text-xs font-bold leading-none">{cur.code}</span>
                            <span className="text-[10px] opacity-50 mt-1">{cur.name}</span>
                        </div>
                        {currency.code === cur.code && (
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
    );
}
