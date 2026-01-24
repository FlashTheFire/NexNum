"use client"

import { cn } from "@/lib/utils/utils";
import { Copy, Check, ChevronRight } from "lucide-react";
import { ServiceIcon } from "../../buy/components/ServiceIcon";
import { useState, useEffect, memo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SafeImage } from "@/components/ui/safe-image";

// Minimal timer - no heavy re-renders
function useTimeLeft(expiresAt: string) {
    const [state, setState] = useState({ timeLeft: "", isExpired: false });

    useEffect(() => {
        const update = () => {
            const diff = new Date(expiresAt).getTime() - Date.now();
            if (diff <= 0) {
                setState({ timeLeft: "Expired", isExpired: true });
                return;
            }
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setState({ timeLeft: `${mins}:${secs.toString().padStart(2, "0")}`, isExpired: false });
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);

    return state;
}

// Country Code Map


interface VaultCardProps {
    number: any;
}

// Memoized card component to prevent unnecessary re-renders
export const VaultCard = memo(({ number }: VaultCardProps) => {
    const [copied, setCopied] = useState(false);
    const { timeLeft, isExpired } = useTimeLeft(number.expiresAt);
    const serviceId = (number.serviceName || 'unknown').toLowerCase();

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(number.number);
        setCopied(true);
        toast.success("Copied");
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <Link href={`/sms/${encodeURIComponent(number.number)}`} className="block">
            <div
                className={cn(
                    "group relative bg-[#111318] active:bg-[#181b22] md:hover:bg-[#181b22] border border-[#2a2e38] active:border-[#3a3e48] md:hover:border-[#3a3e48] rounded-xl px-8 py-6 transition-colors duration-150 cursor-pointer shadow-lg",
                    isExpired && "opacity-60"
                )}
            >
                {/* Top Row */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        {/* Service Icon with Flag Badge */}
                        <div className="relative">
                            <div className="w-10 h-10 rounded-lg bg-[#1A1D24] border border-[#25282F] flex items-center justify-center">
                                <ServiceIcon id={serviceId} className="w-5 h-5 text-gray-300" />
                            </div>
                            {/* Country Flag Badge */}
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#111318] overflow-hidden">
                                <SafeImage
                                    src={number.countryIconUrl}
                                    fallbackSrc="/flags/un.svg"
                                    alt={number.countryName}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                        </div>

                        {/* Service & Country */}
                        <div>
                            <div className="text-[13px] font-semibold text-white capitalize">
                                {number.serviceName}
                            </div>
                            <div className="text-[11px] text-gray-400">
                                {number.countryName}
                            </div>
                        </div>
                    </div>

                    {/* Status */}
                    <div className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded",
                        isExpired
                            ? "text-red-400/80 bg-red-500/10"
                            : "text-emerald-400/80 bg-emerald-500/10"
                    )}>
                        {isExpired ? "Expired" : timeLeft}
                    </div>
                </div>

                {/* Phone Number */}
                <div className="flex items-center justify-between py-2">
                    <span className="font-mono text-lg text-white font-medium tracking-wide truncate pr-2">
                        {number.number}
                    </span>
                    <button
                        onClick={handleCopy}
                        className="p-2 -m-1 rounded-md text-gray-500 active:text-white active:bg-white/10 md:hover:text-white md:hover:bg-white/5 transition-colors touch-manipulation"
                    >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>

                {/* Bottom Row */}
                <div className="flex items-center justify-between pt-2 border-t border-[#2a2e38]">
                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        <span>{number.smsCount || 0} messages</span>
                        <span className="w-1 h-1 rounded-full bg-gray-500" />
                        <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                            Active
                        </span>
                    </div>

                    <ChevronRight className="w-4 h-4 text-gray-500 group-active:text-gray-300 md:group-hover:text-gray-300 transition-colors" />
                </div>
            </div>
        </Link>
    );
});

VaultCard.displayName = 'VaultCard';
