"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Zap, Menu, X, ChevronDown } from "lucide-react";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

interface NavbarProps {
    hideLogin?: boolean;
    hideRegister?: boolean;
}

export default function Navbar({ hideLogin = false, hideRegister = false }: NavbarProps) {
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const t = useTranslations('nav');
    const tc = useTranslations('common');

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const navLinks = [
        { name: t('features'), href: "/#features" },
        { name: t('services'), href: "/services" },
        { name: t('howItWorks'), href: "/#how-it-works" },
        { name: t('faq'), href: "/#faq" },
    ];

    return (
        <>
            <motion.nav
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled
                    ? "bg-[#0a0a0c]/90 backdrop-blur-2xl border-b border-white/[0.06] shadow-2xl shadow-black/20"
                    : "bg-transparent"
                    }`}
            >
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="h-16 lg:h-[72px] flex items-center justify-between relative">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-3 group">
                            <div className="relative">
                                <div className="w-10 h-10 bg-gradient-to-br from-[hsl(var(--neon-lime))] to-[hsl(72,70%,40%)] rounded-xl flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] group-hover:shadow-[hsl(var(--neon-lime)/0.4)] transition-all duration-300 group-hover:scale-105 p-1.5">
                                    <Image
                                        src="/logos/nexnum-logo.svg"
                                        alt="NexNum Logo"
                                        width={28}
                                        height={28}
                                        className="text-black invert-0"
                                        style={{ filter: 'brightness(0)' }}
                                    />
                                </div>
                                {/* Glow effect */}
                                <div className="absolute inset-0 bg-[hsl(var(--neon-lime))] rounded-xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-xl tracking-tight text-white leading-none">
                                    Nex<span className="text-[hsl(var(--neon-lime))]">Num</span>
                                </span>
                                <span className="text-[10px] text-gray-500 tracking-widest uppercase">{t('virtualNumbers')}</span>
                            </div>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden lg:flex items-center absolute left-1/2 -translate-x-1/2">
                            <div className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
                                {navLinks.map((link) => (
                                    <Link
                                        key={link.name}
                                        href={link.href}
                                        className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-full hover:bg-white/[0.06] transition-all duration-200"
                                    >
                                        {link.name}
                                    </Link>
                                ))}
                                <Link
                                    href="/api-docs"
                                    className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white rounded-full hover:bg-white/[0.06] transition-all duration-200 flex items-center gap-1"
                                >
                                    {t('developers')}
                                    <ChevronDown className="w-3 h-3" />
                                </Link>
                            </div>
                        </div>

                        {/* Desktop Actions */}
                        <div className="hidden lg:flex items-center gap-3">
                            <div className="mr-1">
                                <LanguageSwitcher />
                            </div>
                            {!hideLogin && (
                                <Link href="/login">
                                    <Button
                                        variant={hideRegister ? undefined : "ghost"}
                                        className={hideRegister
                                            ? "bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)] font-semibold h-10 px-6 shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] hover:shadow-[hsl(var(--neon-lime)/0.4)] transition-all duration-300"
                                            : "text-gray-300 hover:text-white hover:bg-white/[0.06] font-medium h-10 px-5"
                                        }
                                    >
                                        {tc('login')}
                                    </Button>
                                </Link>
                            )}
                            {!hideRegister && (
                                <Link href="/register">
                                    <Button
                                        className="bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)] font-semibold h-10 px-6 shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] hover:shadow-[hsl(var(--neon-lime)/0.4)] transition-all duration-300"
                                    >
                                        {tc('getStarted')}
                                        <Zap className="w-4 h-4 ml-1.5" />
                                    </Button>
                                </Link>
                            )}
                        </div>

                        {/* Mobile Actions (Switcher + Menu) */}
                        <div className="lg:hidden flex items-center gap-2">
                            <LanguageSwitcher />
                            <button
                                className="p-2.5 text-gray-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-all"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            >
                                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="lg:hidden bg-[#0a0a0c]/98 backdrop-blur-2xl border-t border-white/[0.06] overflow-hidden relative"
                        >
                            {/* Mobile Menu Background Visuals */}
                            <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--neon-lime)/0.05)] to-transparent pointer-events-none" />
                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }}
                            />
                            <div className="container mx-auto px-4 py-6">
                                <div className="flex flex-col gap-1">
                                    {navLinks.map((link, index) => (
                                        <motion.div
                                            key={link.name}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                        >
                                            <Link
                                                href={link.href}
                                                className="flex items-center px-4 py-3.5 text-base font-medium text-gray-300 hover:text-white hover:bg-white/[0.04] rounded-xl transition-all"
                                                onClick={() => setMobileMenuOpen(false)}
                                            >
                                                {link.name}
                                            </Link>
                                        </motion.div>
                                    ))}
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.15 }}
                                    >
                                        <Link
                                            href="/api-docs"
                                            className="flex items-center px-4 py-3.5 text-base font-medium text-gray-300 hover:text-white hover:bg-white/[0.04] rounded-xl transition-all"
                                            onClick={() => setMobileMenuOpen(false)}
                                        >
                                            {t('developers')}
                                        </Link>
                                    </motion.div>
                                    {/* Language Switcher moved to header for mobile */}
                                </div>

                                <div className="flex flex-col gap-3 pt-6 mt-4 border-t border-white/[0.06]">
                                    <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                                        <Button
                                            variant="outline"
                                            className="w-full h-12 text-gray-300 border-white/10 hover:bg-white/[0.04] hover:text-white"
                                        >
                                            {tc('login')}
                                        </Button>
                                    </Link>
                                    <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                                        <Button
                                            className="w-full h-12 bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)] font-semibold"
                                        >
                                            {tc('getStarted')}
                                            <Zap className="w-4 h-4 ml-1.5" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.nav>

            {/* Spacer for fixed navbar */}
            <div className="h-16 lg:h-[72px]" />
        </>
    );
}
