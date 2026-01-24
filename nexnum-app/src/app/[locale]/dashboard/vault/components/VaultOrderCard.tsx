"use client"

import { cn } from "@/lib/utils/utils";
import { Copy, Check, Clock, MessageSquare, Archive, AlertCircle } from "lucide-react";
import { ServiceIcon } from "../../buy/components/ServiceIcon";
import { useState, useEffect, memo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SafeImage } from "@/components/ui/safe-image";

// Timer Hook
function useTimer(expiresAt: string, status: VaultOrderStatus) {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        if (status !== 'active') return;

        const update = () => {
            const diff = new Date(expiresAt).getTime() - Date.now();
            if (diff <= 0) {
                setTimeLeft("0:00");
                return;
            }
            const mins = Math.floor(diff / 60000);
            const secs = Math.floor((diff % 60000) / 1000);
            setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
        };

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [expiresAt, status]);

    return timeLeft;
}

export type VaultOrderStatus = 'active' | 'completed' | 'expired' | 'refunded';

interface VaultOrderCardProps {
    number: any;
    status: VaultOrderStatus;
}

export const VaultOrderCard = memo(({ number, status }: VaultOrderCardProps) => {
    const [copied, setCopied] = useState(false);
    const serviceId = (number.serviceName || 'unknown').toLowerCase();
    const timeLeft = useTimer(number.expiresAt, status);

    const handleCopy = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(number.number);
        setCopied(true);
        toast.success("Copied!");
        setTimeout(() => setCopied(false), 1500);
    };

    const statusStyles = {
        active: {
            border: "border-[hsl(var(--neon-lime))/0.4]",
            accent: "bg-[hsl(var(--neon-lime))]",
            badge: "bg-[hsl(var(--neon-lime))/0.15] text-[hsl(var(--neon-lime))] border-[hsl(var(--neon-lime))/0.3]",
            icon: Clock
        },
        completed: {
            border: "border-emerald-500/30",
            accent: "bg-emerald-500",
            badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
            icon: Check
        },
        expired: {
            border: "border-red-500/20",
            accent: "bg-red-500/60",
            badge: "bg-red-500/10 text-red-400 border-red-500/30",
            icon: Archive
        },
        refunded: {
            border: "border-orange-500/20",
            accent: "bg-orange-500/60",
            badge: "bg-orange-500/10 text-orange-400 border-orange-500/30",
            icon: AlertCircle
        }
    };

    const style = statusStyles[status];
    const StatusIcon = style.icon;

    return (
        <Link href={`/sms/${encodeURIComponent(number.number)}`} className="block h-full">
            <div className={cn(
                "group relative h-full bg-[#0c0d10] border rounded-2xl overflow-hidden transition-all duration-200",
                "hover:bg-[#111318] hover:border-white/20",
                style.border,
                status === 'expired' && "opacity-70 hover:opacity-100"
            )}>
                {/* Left Accent Bar */}
                <div className={cn("absolute left-0 top-0 bottom-0 w-1", style.accent)} />

                <div className="p-4 pl-5">
                    {/* Header: Service + Status */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                            {/* Icon */}
                            <div className="relative shrink-0">
                                <div className="w-10 h-10 rounded-xl bg-[#1a1c22] border border-white/10 flex items-center justify-center">
                                    <ServiceIcon id={serviceId} className="w-5 h-5 text-gray-300" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0c0d10] overflow-hidden">
                                    <SafeImage
                                        src={number.countryIconUrl}
                                        fallbackSrc="/flags/un.svg"
                                        alt=""
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            </div>
                            {/* Text */}
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-white capitalize truncate">
                                    {number.serviceName}
                                </div>
                                <div className="text-[11px] text-zinc-500 truncate">
                                    {number.countryName}
                                </div>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0",
                            style.badge
                        )}>
                            <StatusIcon className="w-3 h-3" strokeWidth={2.5} />
                            <span>{status === 'active' ? timeLeft : status}</span>
                        </div>
                    </div>

                    {/* Phone Number */}
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-lg text-white font-medium tracking-wide truncate">
                            {number.number}
                        </span>
                        <button
                            onClick={handleCopy}
                            className={cn(
                                "p-2 rounded-lg transition-colors shrink-0",
                                copied ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10"
                            )}
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5 text-[11px] text-zinc-500">
                        <MessageSquare className={cn("w-3 h-3", (number.smsCount || 0) > 0 && "text-[hsl(var(--neon-lime))]")} />
                        <span className={cn((number.smsCount || 0) > 0 && "text-white font-medium")}>
                            {number.smsCount || 0} SMS
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
});

VaultOrderCard.displayName = 'VaultOrderCard';
