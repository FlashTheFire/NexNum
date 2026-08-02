"use client"

import { cn } from "@/lib/utils/utils";
import { Copy, Check, Clock, MessageSquare, Archive, AlertCircle, ArrowUpRight, ShieldCheck } from "lucide-react";
import { ServiceIcon } from "../../buy/components/ServiceIcon";
import { useState, useEffect, memo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { PriceDisplay } from "@/components/common/PriceDisplay";

export type VaultOrderStatus = 'active' | 'completed' | 'expired' | 'refunded';

// Hook for live countdown timer & percent remaining
function useTimer(expiresAt: string, status: VaultOrderStatus) {
    const [state, setState] = useState({ timeLeft: "", percent: 100 });

    useEffect(() => {
        if (status !== 'active' || !expiresAt) {
            setState({ timeLeft: "", percent: 0 });
            return;
        }

        const expiryTime = new Date(expiresAt).getTime();
        const totalDuration = 20 * 60 * 1000; // 20 minutes default duration

        const update = () => {
            const now = Date.now();
            const diff = expiryTime - now;

            if (diff <= 0) {
                setState({ timeLeft: "0:00", percent: 0 });
                return;
            }

            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            const percent = Math.max(0, Math.min(100, (diff / totalDuration) * 100));

            setState({
                timeLeft: `${mins}:${secs.toString().padStart(2, "0")}`,
                percent
            });
        };

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [expiresAt, status]);

    return state;
}

interface VaultOrderCardProps {
    number: any;
    status: VaultOrderStatus;
}

export const VaultOrderCard = memo(({ number, status }: VaultOrderCardProps) => {
    const [copied, setCopied] = useState(false);
    const serviceId = (number.serviceName || 'unknown').toLowerCase();
    const { timeLeft, percent } = useTimer(number.expiresAt, status);

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(number.number);
        setCopied(true);
        toast.success("Phone number copied to clipboard!");
        setTimeout(() => setCopied(false), 1500);
    };

    const statusStyles = {
        active: {
            border: "border-[hsl(var(--neon-lime))/0.4]",
            accent: "bg-[hsl(var(--neon-lime))]",
            badge: "bg-[hsl(var(--neon-lime))/0.15] text-[hsl(var(--neon-lime))] border-[hsl(var(--neon-lime))/0.3]",
            glow: "shadow-[0_0_25px_rgba(204,255,0,0.08)]",
            icon: Clock,
            label: "Waiting SMS"
        },
        completed: {
            border: "border-emerald-500/30 hover:border-emerald-500/50",
            accent: "bg-emerald-500",
            badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
            glow: "shadow-[0_0_20px_rgba(16,185,129,0.06)]",
            icon: Check,
            label: "Completed"
        },
        expired: {
            border: "border-red-500/20 opacity-75 hover:opacity-100",
            accent: "bg-red-500/60",
            badge: "bg-red-500/10 text-red-400 border-red-500/20",
            glow: "",
            icon: Archive,
            label: "Expired"
        },
        refunded: {
            border: "border-amber-500/20 opacity-75 hover:opacity-100",
            accent: "bg-amber-500/60",
            badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
            glow: "",
            icon: AlertCircle,
            label: "Refunded"
        },
        cancelled: {
            border: "border-red-500/20 opacity-75 hover:opacity-100",
            accent: "bg-red-500/60",
            badge: "bg-red-500/10 text-red-400 border-red-500/20",
            glow: "",
            icon: AlertCircle,
            label: "Cancelled"
        }
    };

    const style = statusStyles[status] || statusStyles.expired;
    const StatusIcon = style.icon;

    // Check if SMS code snippet exists
    const lastSms = number.smsMessages && number.smsMessages.length > 0 ? number.smsMessages[0] : null;

    return (
        <motion.div
            whileHover={{ y: -3, scale: 1.01 }}
            transition={{ duration: 0.2 }}
            className="h-full"
        >
            <Link href={`/sms/${encodeURIComponent(number.number)}`} className="block h-full">
                <div className={cn(
                    "group relative h-full bg-gradient-to-b from-[#111319]/90 to-[#0b0c10]/95 border rounded-2xl overflow-hidden transition-all duration-300 backdrop-blur-xl flex flex-col justify-between",
                    "hover:bg-[#161922] hover:shadow-2xl",
                    style.border,
                    style.glow
                )}>
                    {/* Left Status Accent Bar */}
                    <div className={cn("absolute left-0 top-0 bottom-0 w-1 z-20 transition-all", style.accent)} />

                    <div className="p-4 pl-5 flex-1 flex flex-col justify-between">
                        <div>
                            {/* Header: Service + Status Badge */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-1.5 shrink-0 group-hover:scale-105 transition-transform">
                                        <ServiceIcon id={serviceId} name={number.serviceName} className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[10px] text-gray-400 font-medium leading-none">Price</span>
                                        <span className="text-xs font-bold text-white leading-none font-sans">
                                            <PriceDisplay currencyPrices={(number as any).currencyPrices} />
                                        </span>
                                    </div>
                                </div>

                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold tracking-wide uppercase shrink-0",
                                    style.badge
                                )}>
                                    <StatusIcon className="w-3 h-3" />
                                    <span>{style.label}</span>
                                </div>
                            </div>

                            {/* Main Phone Number & Copy Action */}
                            <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 px-3 flex items-center justify-between my-3 group/num hover:border-white/15 transition-all">
                                <span className="font-mono text-base font-black text-white tracking-wider">
                                    {(number as any).phoneCountryCode && (number as any).phoneNationalNumber ? (
                                        <>
                                            <span className="text-zinc-500 font-semibold text-sm">{(number as any).phoneCountryCode}</span>
                                            <span className="ml-1">{(number as any).phoneNationalNumber}</span>
                                        </>
                                    ) : (
                                        number.number
                                    )}
                                </span>
                                <button
                                    onClick={handleCopy}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-all active:scale-90"
                                    title="Copy Phone Number"
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-zinc-400 group-hover/num:text-white" />
                                    )}
                                </button>
                            </div>

                            {/* SMS Code Preview if available */}
                            {(number.latestSms || lastSms) && (
                                <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-bold text-emerald-400 truncate">
                                            Code: <span className="font-mono text-xs font-black text-white ml-1">
                                                {number.latestSms?.code || number.latestSms?.content || lastSms?.code || lastSms?.text}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer: Live Countdown Progress Bar (Active) or Stats */}
                        <div className="pt-2 border-t border-white/5">
                            {status === 'active' ? (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs font-mono">
                                        <span className="text-zinc-400 font-semibold flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-[hsl(var(--neon-lime))] animate-pulse" /> Time Left
                                        </span>
                                        <span className="font-bold text-[hsl(var(--neon-lime))] font-mono">
                                            {timeLeft}
                                        </span>
                                    </div>
                                    {/* Progress Bar */}
                                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-[hsl(var(--neon-lime))] to-emerald-400 transition-all duration-1000"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between text-xs text-zinc-400">
                                    <span className="flex items-center gap-1 font-medium">
                                        <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                                        {number.smsCount || 0} SMS Received
                                    </span>
                                    <span className="text-[11px] text-zinc-400">
                                        {number.purchasedAt ? new Date(number.purchasedAt).toLocaleDateString() : 'Recent'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
});

VaultOrderCard.displayName = "VaultOrderCard";
