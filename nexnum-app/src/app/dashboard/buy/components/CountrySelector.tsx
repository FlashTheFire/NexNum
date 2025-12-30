import { motion } from "framer-motion";
import { Globe, ChevronRight, BarChart } from "lucide-react";
import { cn } from "@/lib/utils";

interface Country {
    id: string;
    name: string;
    code: string; // ISO code for flag or display
    flag: string; // Emoji or image URL
    price: number;
    count: number;
    popular?: boolean;
}

const countries: Country[] = [
    { id: "us", name: "United States", code: "US", flag: "🇺🇸", price: 2.50, count: 450, popular: true },
    { id: "gb", name: "United Kingdom", code: "GB", flag: "🇬🇧", price: 3.00, count: 320, popular: true },
    { id: "de", name: "Germany", code: "DE", flag: "🇩🇪", price: 4.00, count: 150 },
    { id: "fr", name: "France", code: "FR", flag: "🇫🇷", price: 2.75, count: 200 },
    { id: "ca", name: "Canada", code: "CA", flag: "🇨🇦", price: 1.50, count: 500, popular: true },
    { id: "br", name: "Brazil", code: "BR", flag: "🇧🇷", price: 1.00, count: 800 },
    { id: "in", name: "India", code: "IN", flag: "🇮🇳", price: 0.50, count: 1200, popular: true },
    { id: "es", name: "Spain", code: "ES", flag: "🇪🇸", price: 2.25, count: 180 },
    { id: "nl", name: "Netherlands", code: "NL", flag: "🇳🇱", price: 3.50, count: 90 },
    { id: "au", name: "Australia", code: "AU", flag: "🇦🇺", price: 4.50, count: 60 },
];

interface CountrySelectorProps {
    onSelect: (country: Country) => void;
    selectedCountryId: string | null;
    searchTerm: string;
}

export default function CountrySelector({ onSelect, selectedCountryId, searchTerm }: CountrySelectorProps) {

    const filteredCountries = countries.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <section className="py-8">

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCountries.map((country) => {
                    const isSelected = selectedCountryId === country.id;
                    return (
                        <motion.button
                            key={country.id}
                            onClick={() => onSelect(country)}
                            whileHover={{ scale: 1.01, x: 2 }}
                            whileTap={{ scale: 0.99 }}
                            className={cn(
                                "relative flex items-center justify-between p-3 rounded-xl border transition-all duration-200 group text-left",
                                isSelected
                                    ? "bg-[hsl(var(--neon-lime)/0.1)] border-[hsl(var(--neon-lime)/0.5)]"
                                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{country.flag}</span>
                                <div>
                                    <div className="text-sm font-bold text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                        {country.name}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Globe className="w-3 h-3" /> {country.code}
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-gray-600" />
                                        <span className="flex items-center gap-1">
                                            <BarChart className="w-3 h-3" /> {country.count} Avail
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                                <span className={cn(
                                    "text-sm font-bold font-mono",
                                    isSelected ? "text-[hsl(var(--neon-lime))]" : "text-white"
                                )}>
                                    ${country.price.toFixed(2)}
                                </span>
                                {country.popular && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[hsl(var(--neon-lime)/0.2)] text-[hsl(var(--neon-lime))] font-medium uppercase tracking-wider">
                                        Hot
                                    </span>
                                )}
                            </div>

                            {/* Selection Indicator Background */}
                            {isSelected && (
                                <motion.div
                                    layoutId="country-selection"
                                    className="absolute inset-0 rounded-xl border-2 border-[hsl(var(--neon-lime))] pointer-events-none"
                                    transition={{ duration: 0.2 }}
                                />
                            )}
                        </motion.button>
                    );
                })}
            </div>

            {filteredCountries.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                    No countries found matching "{searchTerm}"
                </div>
            )}
        </section>
    );
}
