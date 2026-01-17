"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import Image from "next/image";

// HatScripts Circle Flags
const BASE_FLAG_URL = "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/";

const LANGUAGES = [
    { code: "en", label: "English", flagCode: "us" },
    { code: "ru", label: "Русский", flagCode: "ru" },
    { code: "zh", label: "中文", flagCode: "cn" },
    { code: "es", label: "Español", flagCode: "es" },
    { code: "hi", label: "हिन्दी", flagCode: "in" },
    { code: "tr", label: "Türkçe", flagCode: "tr" },
    { code: "ar", label: "العربية", flagCode: "sa" },
    { code: "pt", label: "Português", flagCode: "br" },
    { code: "fr", label: "Français", flagCode: "fr" },
];

export default function LanguageSwitcher() {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();
    const [isOpen, setIsOpen] = useState(false);

    const handleLocaleChange = (newLocale: string) => {
        setIsOpen(false);
        startTransition(() => {
            router.replace(pathname, { locale: newLocale });
        });
    };

    const currentLanguage = LANGUAGES.find(l => l.code === locale) || LANGUAGES[0];

    return (
        <div
            className="relative"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            {/* Trigger Button - Just the Logo (Flag) */}
            <button
                className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300",
                    "hover:bg-white/[0.08] active:scale-95",
                    isOpen ? "bg-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.1)]" : "bg-transparent"
                )}
                aria-label="Select Language"
            >
                <div className="relative w-6 h-6 filter drop-shadow-lg scale-110">
                    <Image
                        src={`${BASE_FLAG_URL}${currentLanguage.flagCode}.svg`}
                        alt={currentLanguage.label}
                        fill
                        className="object-contain"
                        unoptimized
                    />
                </div>
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute right-0 top-full mt-2 w-56 p-1.5 bg-[#0a0a0c]/95 backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl z-50 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar relative">
                            {LANGUAGES.map((lang, index) => (
                                <motion.button
                                    key={lang.code}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    onClick={() => handleLocaleChange(lang.code)}
                                    disabled={isPending}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden",
                                        locale === lang.code
                                            ? "bg-white/[0.08] text-white"
                                            : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                                    )}
                                >
                                    <div className="flex items-center gap-3 relative z-10">
                                        <div className="relative w-5 h-5">
                                            <Image
                                                src={`${BASE_FLAG_URL}${lang.flagCode}.svg`}
                                                alt={lang.label}
                                                fill
                                                className="object-contain"
                                                unoptimized
                                            />
                                        </div>
                                        <span className="text-sm font-medium tracking-wide">{lang.label}</span>
                                    </div>
                                    {locale === lang.code && (
                                        <motion.div
                                            layoutId="activeLang"
                                            className="relative z-10"
                                        >
                                            <Check className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                                        </motion.div>
                                    )}

                                    {/* Hover glow effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                </motion.button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
