"use client"

import { cn } from "@/lib/utils";
import { ChevronDown, Copy, Check } from "lucide-react";
import { ServiceIcon } from "../../buy/components/ServiceIcon";
import { useState, memo } from "react";
import { toast } from "sonner";

// Country Code Map


interface ExpiredCardProps {
    number: any;
}

export const ExpiredCard = memo(({ number }: ExpiredCardProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const serviceId = (number.serviceName || 'unknown').toLowerCase();

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(number.number);
        setCopied(true);
        toast.success("Copied");
        setTimeout(() => setCopied(false), 1500);
    };

    const purchaseDate = number.purchasedAt
        ? new Date(number.purchasedAt).toLocaleDateString()
        : "Unknown";

    // Completed = received SMS, Expired = no SMS received
    const isCompleted = (number.smsCount || 0) > 0;

    return (
        <div
            className={cn(
                "bg-[#1F2229] border border-[#2a2e38] rounded-xl overflow-hidden transition-all duration-200 shadow-md",
                isExpanded ? "ring-1 ring-[#3a3e48]" : ""
            )}
        >
            {/* Folded Header - Always Visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-[#15181E] transition-colors touch-manipulation"
            >
                <div className="flex items-center gap-3 min-w-0">
                    {/* Service Icon with Flag */}
                    <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-[#1A1D24] border border-[#25282F] flex items-center justify-center">
                            <ServiceIcon id={serviceId} className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#111318] overflow-hidden">
                            <img
                                src={number.countryIconUrl || `https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/un.svg`}
                                alt={number.countryName}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                    e.currentTarget.src = 'https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/un.svg'
                                }}
                            />
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="min-w-0">
                        <div className="font-mono text-sm text-white truncate">
                            {number.number}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                            {number.serviceName} • {purchaseDate}
                        </div>
                    </div>
                </div>

                {/* Expand Chevron */}
                <ChevronDown className={cn(
                    "w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-180"
                )} />
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-[#1E2128] animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Full Number with Copy */}
                    <div className="flex items-center justify-between py-2 mb-2">
                        <span className="font-mono text-base text-white">
                            {number.number}
                        </span>
                        <button
                            onClick={handleCopy}
                            className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-[#0A0C0F] rounded-lg p-2">
                            <div className="text-gray-600 mb-0.5">Service</div>
                            <div className="text-gray-400 capitalize">{number.serviceName}</div>
                        </div>
                        <div className="bg-[#0A0C0F] rounded-lg p-2">
                            <div className="text-gray-600 mb-0.5">Country</div>
                            <div className="text-gray-400">{number.countryName}</div>
                        </div>
                        <div className="bg-[#0A0C0F] rounded-lg p-2">
                            <div className="text-gray-600 mb-0.5">Messages</div>
                            <div className="text-gray-400">{number.smsCount || 0} SMS</div>
                        </div>
                        <div className="bg-[#0A0C0F] rounded-lg p-2">
                            <div className="text-gray-600 mb-0.5">Status</div>
                            <div className={isCompleted ? "text-emerald-400" : "text-red-400/80"}>
                                {isCompleted ? "Completed" : "Expired"}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

ExpiredCard.displayName = 'ExpiredCard';
