"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShoppingCart, Wallet, Archive } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils/utils";

export default function DashboardMobileActionBar() {
    const pathname = usePathname();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsVisible(window.scrollY > 10);
        };
        handleScroll();
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const navItems = [
        { href: "/dashboard", label: "Home", icon: LayoutDashboard },
        { href: "/dashboard/buy", label: "Buy", icon: ShoppingCart },
        { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
        { href: "/dashboard/vault", label: "Vault", icon: Archive },
    ];

    // Check if current path matches (handles locale prefixes like /en/dashboard)
    const isActiveLink = (href: string) => {
        if (href === "/dashboard") {
            return pathname === "/dashboard" || pathname.endsWith("/dashboard");
        }
        return pathname.includes(href);
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed bottom-6 left-4 right-4 z-[40] lg:hidden"
                >
                    <div className="bg-[#0a0a0c]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl shadow-black/50 flex items-center gap-1">
                        {/* Left: Icon buttons for non-active items */}
                        <div className="flex items-center gap-1 flex-1">
                            {navItems.map((item) => {
                                const isActive = isActiveLink(item.href);

                                if (isActive) {
                                    // Active item - expanded with label
                                    return (
                                        <motion.div
                                            key={item.href}
                                            layout
                                            className="flex-1"
                                        >
                                            <Link
                                                href={item.href}
                                                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[hsl(var(--neon-lime))] text-black font-bold shadow-[0_0_25px_hsl(var(--neon-lime)/0.3)] transition-all"
                                            >
                                                <item.icon className="w-5 h-5 fill-current" />
                                                <motion.span
                                                    initial={{ opacity: 0, width: 0 }}
                                                    animate={{ opacity: 1, width: "auto" }}
                                                    transition={{ duration: 0.2, delay: 0.1 }}
                                                    className="text-sm whitespace-nowrap overflow-hidden"
                                                >
                                                    {item.label}
                                                </motion.span>
                                            </Link>
                                        </motion.div>
                                    );
                                }

                                // Inactive item - icon only
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className="p-3 rounded-xl hover:bg-white/5 transition-colors group shrink-0"
                                    >
                                        <item.icon className="w-5 h-5 text-gray-400 group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* Bottom safety glow */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1/2 h-4 bg-[hsl(var(--neon-lime)/0.15)] blur-xl pointer-events-none" />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
