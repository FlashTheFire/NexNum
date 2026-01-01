"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShoppingBag, Users, RefreshCw, Server } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export default function AdminMobileActionBar() {
    const pathname = usePathname();
    const [isVisible, setIsVisible] = useState(true); // Always visible for Admin initially, or scroll logic

    // Optional: Scroll logic to hide/show, but User requested "floating bar" which usually implies persistent or smart visibility.
    // Dashboard uses > 10 scroll. Let's keep it similar to Dashboard for consistency.
    useEffect(() => {
        const handleScroll = () => {
            setIsVisible(window.scrollY > 10);
        };
        handleScroll(); // Check initial
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const navItems = [
        { href: "/admin", label: "Overview", icon: LayoutDashboard },
        { href: "/admin/providers", label: "Providers", icon: Server },
        { href: "/admin/inventory", label: "Inventory", icon: ShoppingBag },
        { href: "/admin/users", label: "Users", icon: Users },
    ];

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed bottom-6 left-4 right-4 z-[40] md:hidden"
                >
                    <div className="bg-[#0a0a0c]/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-2 shadow-2xl shadow-black/40 flex items-center justify-between gap-2">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "relative flex items-center justify-center rounded-xl transition-all duration-300 ease-out",
                                        isActive ? "flex-1 bg-[hsl(var(--neon-lime))] text-black shadow-[0_0_20px_hsl(var(--neon-lime)/0.3)]" : "w-12 h-12 text-gray-400 hover:bg-white/5 hover:text-white"
                                    )}
                                >
                                    <div className="flex items-center justify-center gap-2 px-3 py-3">
                                        <item.icon className={cn("w-5 h-5", isActive ? "fill-current" : "")} />
                                        {isActive && (
                                            <motion.span
                                                initial={{ opacity: 0, width: 0 }}
                                                animate={{ opacity: 1, width: "auto" }}
                                                transition={{ duration: 0.2 }}
                                                className="font-bold text-sm whitespace-nowrap overflow-hidden"
                                            >
                                                {item.label}
                                            </motion.span>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Bottom safety glow */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1/2 h-4 bg-[hsl(var(--neon-lime)/0.15)] blur-xl pointer-events-none" />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
