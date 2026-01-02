import { motion } from "framer-motion";
import { ArrowRight, Signal } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { ServiceIcon } from "./ServiceIcon";

export interface SearchOffer {
    id: string;
    provider: string; // "smsbower"
    countryCode: string; // "22"
    countryName: string; // "India"
    serviceCode: string; // "wa"
    serviceName: string; // "WhatsApp"
    price: number;
    count: number;
}

interface OfferCardProps {
    offer: SearchOffer;
    onBuy: (offer: SearchOffer) => void;
    disabled?: boolean;
}

export const OfferCard = ({ offer, onBuy, disabled }: OfferCardProps) => {
    // Determine stock status
    const stockStatus = offer.count > 1000 ? 'High' : offer.count > 100 ? 'Med' : 'Low';
    const stockColor = stockStatus === 'High' ? 'text-green-400' : stockStatus === 'Med' ? 'text-yellow-400' : 'text-red-400';

    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onBuy(offer)}
            disabled={disabled}
            className="group relative flex items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-[hsl(var(--neon-lime))] transition-all w-full text-left overflow-hidden"
        >
            {/* Background Gradient on Hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--neon-lime)/0.05)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="flex items-center gap-4 z-10">
                {/* Service Icon */}
                <div className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center border border-white/5 group-hover:border-[hsl(var(--neon-lime)/0.3)] transition-colors">
                    <ServiceIcon id={offer.serviceCode} className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors" />
                </div>

                {/* Details */}
                <div>
                    <div className="flex items-center gap-2">
                        <img
                            src={`https://flagcdn.com/w20/${offer.countryCode.toLowerCase()}.png`}
                            alt={offer.countryName}
                            className="w-5 h-[15px] object-cover rounded-[2px] opacity-80"
                            onError={(e) => e.currentTarget.style.display = 'none'}
                        />
                        <span className="font-bold text-white text-base">{offer.serviceName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <span>{offer.countryName}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-700" />
                        <span className={stockColor}>{offer.count} Left</span>
                    </div>
                </div>
            </div>

            {/* Price & Action */}
            <div className="z-10 text-right">
                <div className="font-mono text-xl font-bold text-[hsl(var(--neon-lime))]">
                    {formatPrice(offer.price)}
                </div>
                <div className="text-[10px] text-gray-500 group-hover:text-white transition-colors flex items-center justify-end gap-1 mt-1">
                    Buy <ArrowRight className="w-3 h-3 group-hover:-rotate-45 transition-transform" />
                </div>
            </div>
        </motion.button>
    );
};
