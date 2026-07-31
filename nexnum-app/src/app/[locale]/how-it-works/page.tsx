import React from "react";
import {
    ShieldCheck,
    Zap,
    HelpCircle,
    ArrowRight,
    Smartphone,
    CreditCard,
    CheckCircle2,
    Lock,
    Clock,
    Sparkles,
    Cpu,
    Globe2,
    Flame,
    ChevronRight
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileActionBar from "@/components/common/MobileActionBar";
import { setRequestLocale } from 'next-intl/server';
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "How It Works — NexNum | Instant Virtual Numbers & OTP Verification",
    description: "Learn how NexNum works in 3 simple steps. Get instant virtual phone numbers for OTP verification on 500+ platforms. Indian UPI, Crypto, 50+ countries. 99.9% delivery rate.",
    openGraph: {
        title: "How NexNum Works — Virtual Numbers & OTP Verification",
        description: "Enterprise-grade virtual numbers with instant setup. 500+ platforms, 50+ countries, pay-per-number pricing.",
        type: "website",
    },
};

// Shared design tokens matching Hero section exactly
const cardHover = "hover:border-[hsl(var(--neon-lime)/0.3)] hover:shadow-2xl hover:shadow-[hsl(var(--neon-lime)/0.08)] transition-all duration-500 hover:-translate-y-1";
const sectionTitle = "text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.08]";
const sectionSubtitle = "text-base sm:text-lg text-gray-400 max-w-2xl mt-4 leading-relaxed";
const iconBadge = "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg";
const neonLime = "text-[hsl(var(--neon-lime))]";
const neonLimeBg = "bg-[hsl(var(--neon-lime)/0.12)]";
const neonLimeBorder = "border-[hsl(var(--neon-lime)/0.3)]";

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);

    return (
        <div className="min-h-screen flex flex-col bg-[#0a0a0c]">
            <Navbar />
            <main className="flex-1">
                {/* PAGE HERO — Matches Hero.tsx gradient, film-grain, vignette */}
                <section className="relative overflow-hidden hero-gradient film-grain vignette pt-32 pb-20">
                    {/* Spotlight */}
                    <div className="absolute inset-0 spotlight pointer-events-none" />

                    {/* Bokeh orbs — exactly from Hero.tsx */}
                    <div className="absolute top-20 left-[15%] w-32 h-32 rounded-full bg-[hsl(var(--neon-lime)/0.1)] blur-3xl bokeh" />
                    <div className="absolute bottom-32 left-[25%] w-24 h-24 rounded-full bg-teal-500/10 blur-2xl bokeh" style={{ animationDelay: "1s" }} />
                    <div className="absolute top-1/3 right-[5%] w-40 h-40 rounded-full bg-[hsl(var(--neon-lime)/0.05)] blur-3xl bokeh" style={{ animationDelay: "2s" }} />

                    {/* Neon rings — exactly from Hero.tsx */}
                    <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full border-2 border-[hsl(var(--neon-lime)/0.2)] opacity-50" />
                    <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full border border-[hsl(var(--neon-lime)/0.1)]" />

                    <div className="container mx-auto px-4 max-w-6xl relative z-10">
                        {/* Breadcrumb — Dashboard-style */}
                        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8">
                            <Link href="/" className="hover:text-white transition-colors">Home</Link>
                            <ChevronRight className="h-3.5 w-3.5" />
                            <span className={neonLime}>How It Works</span>
                        </nav>

                        {/* Status badge — Hero.tsx exact pattern */}
                        <div className="inline-flex items-center px-4 py-2 rounded-full border border-[hsl(var(--neon-lime)/0.4)] bg-[hsl(var(--neon-lime)/0.08)] backdrop-blur-sm mb-8 shadow-lg shadow-[hsl(var(--neon-lime)/0.1)]">
                            <span className="relative flex h-2 w-2 mr-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--neon-lime))]" />
                            </span>
                            <span className="text-sm font-semibold text-[hsl(var(--neon-lime))] tracking-wider uppercase">
                                Enterprise-Grade Virtual Numbers
                            </span>
                        </div>

                        {/* Hero headline — matches Hero.tsx H1 pattern */}
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-[1.08] max-w-4xl">
                            <span className="text-white">How </span>
                            <span className="text-[hsl(var(--neon-lime))] neon-text-glow">NexNum</span>
                            <span className="text-white"> Works</span>
                        </h1>

                        <p className="text-xl sm:text-2xl font-medium leading-relaxed text-gray-300 max-w-4xl">
                            India&apos;s premier platform for instant virtual phone numbers and private online OTP SMS verifications.
                            Designed for security researchers, automated testing, privacy-conscious individuals, and businesses
                            requiring disposable access to over <strong className="text-white">500+ global platforms</strong>.
                        </p>

                        {/* Trust indicators — Hero.tsx pattern */}
                        <div className="flex flex-wrap items-center gap-6 text-sm mt-10">
                            {["Instant Activation", "50+ Countries", "Crypto Accepted"].map((item) => (
                                <div key={item} className="flex items-center gap-2 text-gray-400">
                                    <div className="w-5 h-5 rounded-full bg-[hsl(var(--neon-lime)/0.15)] flex items-center justify-center">
                                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--neon-lime))]" />
                                    </div>
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 3 SIMPLE STEPS — Dashboard stat-card aesthetic */}
                <section className="relative py-24 bg-[#0a0a0c] overflow-hidden">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-[hsl(var(--neon-lime)/0.04)] blur-[140px] pointer-events-none rounded-full" />

                    <div className="container mx-auto px-4 max-w-6xl relative z-10">
                        <div className="flex flex-col items-center text-center mb-16">
                            <div className={`${iconBadge} ${neonLimeBg} border ${neonLimeBorder} mb-5 shadow-[hsl(var(--neon-lime)/0.1)]`}>
                                <Zap className={`h-6 w-6 ${neonLime}`} />
                            </div>
                            <h2 className={sectionTitle}>
                                3 Simple <span className={`${neonLime} neon-text-glow`}>Steps</span>
                            </h2>
                            <p className={sectionSubtitle}>
                                Acquire fully functional virtual numbers with zero identity disclosure or recurring monthly commitments.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {[
                                { step: "01", tag: "Instant Setup", title: "Add Wallet Credits", desc: "Fund your balance instantly using Indian UPI (Google Pay, PhonePe, Paytm), Net Banking, Credit/Debit cards, or Cryptocurrencies. Minimum top-up is just Rs. 50 with no hidden fees.", color: "from-[hsl(var(--neon-lime)/0.15)]" },
                                { step: "02", tag: "500+ Platforms", title: "Select Target Service", desc: "Choose from an extensive library of platforms including WhatsApp, Telegram, OpenAI ChatGPT, Google, Instagram, TikTok, Discord, and Indian fintech services.", color: "from-cyan-400/15" },
                                { step: "03", tag: "Live Delivery", title: "Receive Real-Time OTP", desc: "Obtain your dedicated temporary number (covering India & 50+ international countries) and observe your verification code arriving on your real-time dashboard in seconds.", color: "from-emerald-400/15", tagHighlight: true as boolean }
                            ].map((item, i) => (
                                <div key={i} className="relative group">
                                    <div className="absolute -inset-[1px] rounded-[20px] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-40 group-hover:opacity-100 group-hover:via-[hsl(var(--neon-lime)/0.2)] transition-all duration-500" />
                                    <div className={`relative rounded-[19px] p-8 bg-gradient-to-b ${item.color} to-[#0d0d10]/60 backdrop-blur-xl border border-white/[0.06] ${cardHover}`}>
                                        <div className="flex items-center justify-between mb-6">
                                            <div className={`w-12 h-12 rounded-2xl ${neonLimeBg} ${neonLime} flex items-center justify-center font-black text-xl border ${neonLimeBorder} shadow-md`}>
                                                {item.step}
                                            </div>
                                            <span className={`text-xs font-mono uppercase tracking-widest ${item.tagHighlight ? 'text-emerald-400 font-bold' : 'text-gray-500'}`}>
                                                {item.tag}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-3 group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                            {item.title}
                                        </h3>
                                        <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.03] overflow-hidden rounded-b-[19px]">
                                            <div className="h-full bg-[hsl(var(--neon-lime))] opacity-40" style={{ width: `${33 * (i + 1)}%` }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 500+ SUPPORTED SERVICES */}
                <section className="relative py-24 bg-[#08080a] overflow-hidden border-t border-white/[0.04]">
                    <div className="absolute bottom-10 -right-20 w-96 h-96 bg-teal-500/5 blur-[120px] pointer-events-none rounded-full" />
                    <div className="absolute top-10 -left-20 w-96 h-96 bg-[hsl(var(--neon-lime)/0.04)] blur-[120px] pointer-events-none rounded-full" />

                    <div className="container mx-auto px-4 max-w-6xl relative z-10">
                        <div className="flex flex-col items-center text-center mb-16">
                            <div className={`${iconBadge} bg-blue-500/10 border border-blue-500/30 mb-5 shadow-blue-500/10`}>
                                <Smartphone className="h-6 w-6 text-blue-400" />
                            </div>
                            <h2 className={sectionTitle}>
                                <span className={`${neonLime} neon-text-glow`}>500+ Supported Services</span> for OTP Verification
                            </h2>
                            <p className={sectionSubtitle}>
                                Real SIM-card routes maintained with direct telecom carriers to ensure maximum verification success.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {[
                                { icon: Globe2, iconColor: "text-blue-400", iconBg: "bg-blue-500/15", hoverBorder: "hover:border-blue-500/40", title: "WhatsApp & Telegram Verification", desc: "Create secondary business or confidential accounts effortlessly. NexNum delivers reliable virtual numbers for WhatsApp, WhatsApp Business, and Telegram, ensuring seamless activation without exposing your personal phone number." },
                                { icon: Cpu, iconColor: "text-purple-400", iconBg: "bg-purple-500/15", hoverBorder: "hover:border-purple-500/40", title: "Google, OpenAI & Social Media", desc: "Streamline multi-account creation for marketing and automated workflows. Get verified numbers for Google / Gmail, OpenAI ChatGPT, Microsoft, Instagram, TikTok, Twitter / X, Discord, and Snapchat." },
                                { icon: ShieldCheck, iconColor: "text-emerald-400", iconBg: "bg-emerald-500/15", hoverBorder: "hover:border-emerald-500/40", title: "E-Commerce & Fintech", desc: "Verify shopping and financial platforms with end-to-end privacy. We support Flipkart, Amazon, Swiggy, and Zomato, alongside global crypto platforms like Binance and Paytm." }
                            ].map((cat, i) => (
                                <div key={i} className="relative group">
                                    <div className="absolute -inset-[1px] rounded-[20px] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-30 group-hover:opacity-80 transition-all duration-500" />
                                    <div className={`relative rounded-[19px] p-8 bg-[#0d0d10]/60 backdrop-blur-xl border border-white/[0.06] ${cat.hoverBorder} transition-all duration-300`}>
                                        <div className={`w-10 h-10 rounded-xl ${cat.iconBg} ${cat.iconColor} flex items-center justify-center font-bold mb-6`}>
                                            <cat.icon className="h-5 w-5" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-3">{cat.title}</h3>
                                        <p className="text-sm text-gray-400 leading-relaxed">{cat.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* WHY CHOOSE NEXNUM */}
                <section className="relative py-24 bg-[#0a0a0c] overflow-hidden border-t border-white/[0.04]">
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[hsl(var(--neon-lime)/0.05)] blur-[140px] pointer-events-none rounded-full" />

                    <div className="container mx-auto px-4 max-w-6xl relative z-10">
                        <div className="flex flex-col items-center text-center mb-16">
                            <div className={`${iconBadge} ${neonLimeBg} border ${neonLimeBorder} mb-5 shadow-[hsl(var(--neon-lime)/0.1)]`}>
                                <Sparkles className={`h-6 w-6 ${neonLime}`} />
                            </div>
                            <h2 className={sectionTitle}>
                                Why Choose <span className={`${neonLime} neon-text-glow`}>NexNum</span>?
                            </h2>
                            <p className={sectionSubtitle}>
                                Engineered with zero compromises on privacy, speed, and carrier reliability.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            {[
                                { icon: CreditCard, title: "Pay Per Number – No Subscription", desc: "Enjoy total flexibility. You only pay for the exact numbers you activate. No monthly commitments, no recurring deductions, and wallet credits never expire." },
                                { icon: Clock, title: "20-Minute Validity & 99.9% Success", desc: "Every line stays active for a full 20 minutes, allowing you to receive multiple verification codes for your target service with industry-leading speed and 99.9% delivery reliability." },
                                { icon: Lock, title: "100% Secure Indian Virtual Numbers", desc: "Safeguard your digital identity against unwanted spam. All message transmissions are end-to-end encrypted and completely isolated from your personal mobile identity." }
                            ].map((feature, i) => (
                                <div key={i} className="relative group">
                                    <div className="absolute -inset-[1px] rounded-[20px] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-40 group-hover:opacity-100 group-hover:via-[hsl(var(--neon-lime)/0.15)] transition-all duration-500" />
                                    <div className={`relative rounded-[19px] p-8 bg-[#0d0d10]/60 backdrop-blur-xl border border-white/[0.06] ${cardHover}`}>
                                        <div className={`w-10 h-10 rounded-xl ${neonLimeBg} ${neonLime} flex items-center justify-center font-bold mb-5`}>
                                            <feature.icon className="h-5 w-5" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                                        <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* PRICING TIERS */}
                <section className="relative py-24 bg-[#08080a] overflow-hidden border-t border-white/[0.04]">
                    <div className="container mx-auto px-4 max-w-6xl relative z-10">
                        <div className="flex flex-col items-center text-center mb-16">
                            <div className={`${iconBadge} bg-amber-500/10 border border-amber-500/30 mb-5 shadow-amber-500/10`}>
                                <Flame className="h-6 w-6 text-amber-400" />
                            </div>
                            <h2 className={sectionTitle}>
                                Flexible Pricing for <span className={`${neonLime} neon-text-glow`}>Every Need</span>
                            </h2>
                            <p className={sectionSubtitle}>
                                Transparent per-verification rates tailored for personal use and developer automation.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6">
                            <div className="relative group">
                                <div className="absolute -inset-[1px] rounded-[20px] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-30 group-hover:opacity-70 transition-all duration-500" />
                                <div className="relative rounded-[19px] p-8 bg-[#0d0d10]/60 backdrop-blur-xl border border-white/[0.06] hover:border-white/20 transition-all text-center">
                                    <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Essential Tier</span>
                                    <h3 className="text-xl font-bold text-white mt-2 mb-4">Basic Services</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed">
                                        Optimized for lightweight verification needs including Telegram, secondary web portals, and standard messaging tools.
                                    </p>
                                </div>
                            </div>

                            <div className="relative group">
                                <div className="absolute -inset-[1px] rounded-[20px] bg-gradient-to-b from-[hsl(var(--neon-lime)/0.4)] via-[hsl(var(--neon-lime)/0.15)] to-transparent opacity-60 group-hover:opacity-100 transition-all duration-500" />
                                <div className="relative rounded-[19px] p-8 bg-gradient-to-b from-[hsl(var(--neon-lime)/0.1)] to-[#0d0d10]/60 backdrop-blur-xl border border-[hsl(var(--neon-lime)/0.3)] shadow-xl shadow-[hsl(var(--neon-lime)/0.08)] text-center">
                                    <span className="inline-block px-3 py-1 rounded-full bg-[hsl(var(--neon-lime))] text-black font-extrabold text-[10px] tracking-wider uppercase mb-3">
                                        Most Popular
                                    </span>
                                    <h3 className="text-xl font-bold text-white mb-4">Social & Messaging</h3>
                                    <p className="text-sm text-gray-300 leading-relaxed">
                                        Dedicated high-priority numbers for WhatsApp, WhatsApp Business, Discord, TikTok, Instagram, and Twitter / X.
                                    </p>
                                </div>
                            </div>

                            <div className="relative group">
                                <div className="absolute -inset-[1px] rounded-[20px] bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-30 group-hover:opacity-70 transition-all duration-500" />
                                <div className="relative rounded-[19px] p-8 bg-[#0d0d10]/60 backdrop-blur-xl border border-white/[0.06] hover:border-white/20 transition-all text-center">
                                    <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Pro Tier</span>
                                    <h3 className="text-xl font-bold text-white mt-2 mb-4">AI & Enterprise</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed">
                                        Premium routes for Google / Gmail, OpenAI ChatGPT, Microsoft, Banking applications, and automated API workflows.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FAQ */}
                <section className="relative py-24 bg-[#0a0a0c] overflow-hidden border-t border-white/[0.04]">
                    <div className="container mx-auto px-4 max-w-6xl relative z-10">
                        <div className="flex flex-col items-center text-center mb-16">
                            <div className={`${iconBadge} bg-teal-500/10 border border-teal-500/30 mb-5 shadow-teal-500/10`}>
                                <HelpCircle className="h-6 w-6 text-teal-400" />
                            </div>
                            <h2 className={sectionTitle}>
                                Frequently Asked Questions About <span className={`${neonLime} neon-text-glow`}>Virtual Numbers</span>
                            </h2>
                        </div>

                        <div className="space-y-4 max-w-4xl mx-auto">
                            {[
                                { q: "What is a virtual number?", a: "A virtual number is an online disposable phone line capable of receiving SMS messages for account verification. It enables you to sign up for platforms without exposing your primary mobile number." },
                                { q: "Is it legal to use virtual numbers for OTP verification in India?", a: "Yes. NexNum routes real carrier lines strictly for standard account verification and testing purposes in compliance with terms of service protocols." },
                                { q: "What if the OTP SMS does not arrive?", a: "If an OTP fails to deliver within 5 minutes, you can cancel the request with a single click and receive an automatic 100% refund straight to your wallet." },
                                { q: "Which payment options are supported?", a: "We accept Indian UPI (Google Pay, PhonePe, Paytm), Net Banking, Debit/Credit cards, and major Cryptocurrencies for maximum convenience." },
                            ].map((faq, i) => (
                                <div key={i} className="relative group">
                                    <div className="absolute -inset-[1px] rounded-[16px] bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500" />
                                    <div className="relative rounded-[15px] p-6 bg-[#0d0d10]/60 backdrop-blur-xl border border-white/[0.06] hover:border-white/10 transition-all duration-300">
                                        <h3 className="text-lg font-bold text-white mb-2">{faq.q}</h3>
                                        <p className="text-sm text-gray-400 leading-relaxed">{faq.a}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* CTA BANNER */}
                <section className="relative py-24 bg-[#08080a] overflow-hidden border-t border-white/[0.04]">
                    <div className="container mx-auto px-4 max-w-6xl relative z-10">
                        <div className="relative rounded-[24px] p-10 sm:p-16 bg-gradient-to-r from-[hsl(var(--neon-lime)/0.15)] via-white/[0.04] to-teal-500/10 border border-[hsl(var(--neon-lime)/0.3)] text-center overflow-hidden shadow-2xl group">
                            <div className="absolute inset-0 bg-[hsl(var(--neon-lime)/0.04)] blur-2xl pointer-events-none" />
                            <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[hsl(var(--neon-lime)/0.1)] blur-[100px] pointer-events-none" />

                            <h3 className="text-2xl sm:text-4xl font-extrabold text-white mb-4 relative z-10 tracking-tight">
                                Join 50,000+ Satisfied Users Across India
                            </h3>
                            <p className="text-sm sm:text-base text-gray-300 mb-10 max-w-2xl mx-auto leading-relaxed relative z-10">
                                Protect your personal privacy on unverified signups. Activate your instant Indian virtual number now.
                            </p>
                            <Link
                                href="/register"
                                className="inline-flex items-center justify-center h-14 px-10 font-bold bg-[hsl(var(--neon-lime))] text-black rounded-2xl hover:bg-[hsl(var(--neon-lime-soft))] transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.3)] hover:scale-105 relative z-10 neon-glow"
                            >
                                Get Virtual Number Now <ArrowRight className="ml-2 h-5 w-5" />
                            </Link>
                        </div>
                    </div>
                </section>

            </main>
            <MobileActionBar />
            <Footer />
        </div>
    );
}
