import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, Search } from "lucide-react";

interface Service {
    id: string;
    name: string;
    icon: string; // Path to icon or component name
    popular?: boolean;
}

const services: Service[] = [
    { id: "whatsapp", name: "WhatsApp", icon: "/icons/whatsapp.svg", popular: true },
    { id: "telegram", name: "Telegram", icon: "/icons/telegram.svg", popular: true },
    { id: "google", name: "Google", icon: "/icons/google.svg", popular: true },
    { id: "facebook", name: "Facebook", icon: "/icons/facebook.svg" },
    { id: "tiktok", name: "TikTok", icon: "/icons/tiktok.svg", popular: true },
    { id: "instagram", name: "Instagram", icon: "/icons/instagram.svg" },
    { id: "openai", name: "OpenAI", icon: "/icons/openai.svg" },
    { id: "discord", name: "Discord", icon: "/icons/discord.svg" },
    { id: "amazon", name: "Amazon", icon: "/icons/amazon.svg" },
    { id: "twitter", name: "Twitter", icon: "/icons/twitter.svg" },
    { id: "uber", name: "Uber", icon: "/icons/uber.svg" },
    { id: "netflix", name: "Netflix", icon: "/icons/netflix.svg" },
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
                                key={service.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={() => onSelect(service.id)}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                className={cn(
                                    "relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 aspect-[4/5] sm:aspect-square group",
                                    isSelected
                                        ? "bg-[hsl(var(--neon-lime)/0.15)] border-[hsl(var(--neon-lime))] shadow-[0_0_20px_hsl(var(--neon-lime)/0.2)]"
                                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                {/* Popular Badge */}
                                {service.popular && (
                                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))] shadow-[0_0_5px_hsl(var(--neon-lime))]" />
                                )}

                                {/* Service Icon Placeholder */}
                                <div className={cn(
                                    "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-lg font-bold mb-3 transition-colors",
                                    isSelected ? "bg-[hsl(var(--neon-lime))] text-black" : "bg-white/10 text-gray-400 group-hover:bg-white/20 group-hover:text-white"
                                )}>
                                    {service.name.substring(0, 1)}
                                </div>

                                <span className={cn(
                                    "text-xs font-medium transition-colors",
                                    isSelected ? "text-white" : "text-gray-400 group-hover:text-gray-300"
                                )}>
                                    {service.name}
                                </span>

                                {/* Checkmark for active state */}
                                {isSelected && (
                                    <div className="absolute top-2 left-2">
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
                        <Search className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">No services found for "{searchTerm}"</p>
                    </div>
                )}
            </div>
        </section>
    );
}
