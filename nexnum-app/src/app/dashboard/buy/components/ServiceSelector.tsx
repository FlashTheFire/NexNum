import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, Search } from "lucide-react";
import { ServiceIcon } from "./ServiceIcon";

interface Service {
    id: string;
    name: string;
    popular?: boolean;
    color?: string;
}

const services: Service[] = [
    { id: "whatsapp", name: "WhatsApp", popular: true, color: "#25D366" },
    { id: "telegram", name: "Telegram", popular: true, color: "#26A5E4" },
    { id: "google", name: "Google", popular: true, color: "#4285F4" },
    { id: "facebook", name: "Facebook", color: "#1877F2" },
    { id: "tiktok", name: "TikTok", popular: true, color: "#FE2C55" },
    { id: "instagram", name: "Instagram", color: "#E4405F" },
    { id: "openai", name: "OpenAI", color: "#10A37F" },
    { id: "discord", name: "Discord", color: "#5865F2" },
    { id: "amazon", name: "Amazon", color: "#FF9900" },
    { id: "twitter", name: "Twitter", color: "#1DA1F2" },
    { id: "uber", name: "Uber", color: "#FFFFFF" },
    { id: "netflix", name: "Netflix", color: "#E50914" },
];

interface ServiceSelectorProps {
    selectedService: string | null;
    onSelect: (id: string) => void;
    searchTerm: string;
}

export default function ServiceSelector({ selectedService, onSelect, searchTerm }: ServiceSelectorProps) {
    const filteredServices = services.filter(service =>
        service.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <section className="py-4 md:py-8">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 lg:gap-4 min-h-[300px] content-start">
                <AnimatePresence mode="popLayout">
                    {filteredServices.map((service) => {
                        const isSelected = selectedService === service.id;
                        return (
                            <motion.button
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                key={service.id}
                                onClick={() => onSelect(service.id)}
                                style={{ '--brand-color': service.color } as React.CSSProperties}
                                className={cn(
                                    "relative flex flex-col items-center justify-center p-4 aspect-square rounded-2xl border transition-all duration-300 group overflow-hidden",
                                    isSelected
                                        ? "bg-[hsl(var(--neon-lime)/0.1)] border-[hsl(var(--neon-lime)/0.5)] shadow-[0_0_20px_hsl(var(--neon-lime)/0.1)]"
                                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02]"
                                )}
                            >
                                {/* Hover Gradient Backlight */}
                                <div
                                    className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none"
                                    style={{ background: `radial-gradient(circle at center, ${service.color}, transparent 70%)` }}
                                />

                                <div className="relative z-10 p-2 mb-2 rounded-xl bg-white/5 group-hover:bg-white/10 transition-colors">
                                    <ServiceIcon
                                        id={service.id}
                                        className={cn(
                                            "w-8 h-8 transition-all duration-300",
                                            isSelected
                                                ? "text-[hsl(var(--neon-lime))]"
                                                : "text-gray-300 group-hover:scale-110 group-hover:text-[var(--brand-color)]"
                                        )}
                                    />
                                </div>

                                <span className={cn(
                                    "text-xs font-medium transition-colors relative z-10",
                                    isSelected ? "text-[hsl(var(--neon-lime))]" : "text-gray-400 group-hover:text-white"
                                )}>
                                    {service.name}
                                </span>

                                {service.popular && (
                                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))] animate-pulse shadow-[0_0_8px_hsl(var(--neon-lime))]" />
                                )}

                                {/* Checkmark for active state */}
                                {isSelected && (
                                    <div className="absolute top-2 left-2 z-10">
                                        <div className="w-4 h-4 bg-[hsl(var(--neon-lime))] rounded-full flex items-center justify-center shadow-lg">
                                            <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                                        </div>
                                    </div>
                                )}
                            </motion.button>
                        );
                    })}
                </AnimatePresence>

                {filteredServices.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-500">
                        <ServiceIcon id="search" className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-sm">No services found for "{searchTerm}"</p>
                    </div>
                )}
            </div>
        </section>
    );
}
