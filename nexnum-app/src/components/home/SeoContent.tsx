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
    Server,
    Flame
} from "lucide-react";
import Link from "next/link";

export default function SeoContent() {
    return (
        <section className="relative py-24 bg-[#08080a] text-gray-200 overflow-hidden border-t border-white/10">
            {/* Ambient Background Glows & Orbs */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[hsl(var(--neon-lime)/0.06)] blur-[140px] pointer-events-none rounded-full" />
            <div className="absolute bottom-10 -right-20 w-96 h-96 bg-teal-500/5 blur-[120px] pointer-events-none rounded-full" />
            <div className="absolute top-10 -left-20 w-96 h-96 bg-[hsl(var(--neon-lime)/0.04)] blur-[120px] pointer-events-none rounded-full" />

            <div className="container mx-auto px-4 max-w-6xl relative z-10">

                {/* Hero-like Intro Banner */}
                <div className="relative rounded-3xl p-8 sm:p-12 mb-20 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent border border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden group hover:border-[hsl(var(--neon-lime)/0.3)] transition-all duration-500">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[hsl(var(--neon-lime)/0.12)] to-transparent rounded-bl-full pointer-events-none" />
                    
                    <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-[hsl(var(--neon-lime)/0.4)] bg-[hsl(var(--neon-lime)/0.08)] backdrop-blur-sm mb-6 shadow-md shadow-[hsl(var(--neon-lime)/0.1)]">
                        <span className="relative flex h-2 w-2 mr-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--neon-lime))]" />
                        </span>
                        <span className="text-xs font-semibold text-[hsl(var(--neon-lime))] tracking-wider uppercase">
                            Enterprise-Grade Virtual Numbers
                        </span>
                    </div>

                    <p className="text-xl sm:text-2xl font-medium leading-relaxed text-gray-100 max-w-4xl">
                        Welcome to <strong className="text-white font-extrabold text-[hsl(var(--neon-lime))]">NexNum</strong> — India’s premier platform for instant virtual phone numbers and private online OTP SMS verifications. Designed for security researchers, automated testing, privacy-conscious individuals, and businesses requiring disposable access to over 500+ global platforms.
                    </p>
                </div>

                {/* SECTION 1: How NexNum Works */}
                <div className="mb-24">
                    <div className="flex flex-col items-center text-center mb-12">
                        <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--neon-lime)/0.12)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center mb-4 shadow-lg shadow-[hsl(var(--neon-lime)/0.1)]">
                            <Zap className="h-6 w-6 text-[hsl(var(--neon-lime))]" />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                            How NexNum Works in <span className="text-[hsl(var(--neon-lime))] neon-text-glow">3 Simple Steps</span>
                        </h2>
                        <p className="text-base text-gray-400 max-w-2xl mt-3 leading-relaxed">
                            Acquire fully functional virtual numbers with zero identity disclosure or recurring monthly commitments.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Step 1 */}
                        <div className="relative rounded-3xl p-8 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-xl hover:border-[hsl(var(--neon-lime)/0.5)] hover:shadow-2xl hover:shadow-[hsl(var(--neon-lime)/0.12)] transition-all duration-300 hover:-translate-y-1.5 group">
                            <div className="flex items-center justify-between mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] flex items-center justify-center font-black text-xl border border-[hsl(var(--neon-lime)/0.3)] shadow-md">
                                    01
                                </div>
                                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Instant Setup</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3 group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                Add Wallet Credits
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Fund your balance instantly using Indian UPI (Google Pay, PhonePe, Paytm), Net Banking, Credit/Debit cards, or Cryptocurrencies. Minimum top-up is just Rs. 50 with no hidden fees.
                            </p>
                        </div>

                        {/* Step 2 */}
                        <div className="relative rounded-3xl p-8 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-xl hover:border-[hsl(var(--neon-lime)/0.5)] hover:shadow-2xl hover:shadow-[hsl(var(--neon-lime)/0.12)] transition-all duration-300 hover:-translate-y-1.5 group">
                            <div className="flex items-center justify-between mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] flex items-center justify-center font-black text-xl border border-[hsl(var(--neon-lime)/0.3)] shadow-md">
                                    02
                                </div>
                                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">500+ Platforms</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3 group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                Select Target Service
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Choose from an extensive library of platforms including WhatsApp, Telegram, OpenAI ChatGPT, Google, Instagram, TikTok, Discord, and Indian fintech services.
                            </p>
                        </div>

                        {/* Step 3 */}
                        <div className="relative rounded-3xl p-8 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-xl hover:border-[hsl(var(--neon-lime)/0.5)] hover:shadow-2xl hover:shadow-[hsl(var(--neon-lime)/0.12)] transition-all duration-300 hover:-translate-y-1.5 group">
                            <div className="flex items-center justify-between mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] flex items-center justify-center font-black text-xl border border-[hsl(var(--neon-lime)/0.3)] shadow-md">
                                    03
                                </div>
                                <span className="text-xs font-mono text-gray-500 uppercase tracking-widest font-bold text-emerald-400">Live Delivery</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3 group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                Receive Real-Time OTP
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Obtain your dedicated temporary number (covering India & 50+ international countries) and observe your verification code arriving on your real-time dashboard in seconds.
                            </p>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: 500+ Supported Services */}
                <div className="mb-24">
                    <div className="flex flex-col items-center text-center mb-12">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/10">
                            <Smartphone className="h-6 w-6 text-blue-400" />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                            <span className="text-[hsl(var(--neon-lime))] neon-text-glow">500+ Supported Services</span> for OTP Verification
                        </h2>
                        <p className="text-base text-gray-400 max-w-2xl mt-3 leading-relaxed">
                            Real SIM-card routes maintained with direct telecom carriers to ensure maximum verification success.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Service Category 1 */}
                        <div className="rounded-3xl p-8 bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/10 hover:border-blue-500/40 transition-all duration-300">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center font-bold mb-6">
                                <Globe2 className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                WhatsApp & Telegram Verification
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Create secondary business or confidential accounts effortlessly. NexNum delivers reliable virtual numbers for <strong className="text-white">WhatsApp</strong>, <strong className="text-white">WhatsApp Business</strong>, and <strong className="text-white">Telegram</strong>, ensuring seamless activation without exposing your personal phone number.
                            </p>
                        </div>

                        {/* Service Category 2 */}
                        <div className="rounded-3xl p-8 bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/10 hover:border-purple-500/40 transition-all duration-300">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center font-bold mb-6">
                                <Cpu className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                Google, OpenAI & Social Media (Instagram, TikTok, Discord)
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Streamline multi-account creation for marketing and automated workflows. Get verified numbers for <strong className="text-white">Google / Gmail</strong>, <strong className="text-white">OpenAI ChatGPT</strong>, <strong className="text-white">Microsoft</strong>, <strong className="text-white">Instagram</strong>, <strong className="text-white">TikTok</strong>, <strong className="text-white">Twitter / X</strong>, <strong className="text-white">Discord</strong>, and <strong className="text-white">Snapchat</strong>.
                            </p>
                        </div>

                        {/* Service Category 3 */}
                        <div className="rounded-3xl p-8 bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/10 hover:border-emerald-500/40 transition-all duration-300">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold mb-6">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">
                                E-Commerce & Fintech (Amazon, Flipkart, Binance)
                            </h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Verify shopping and financial platforms with end-to-end privacy. We support Indian consumer leaders like <strong className="text-white">Flipkart</strong>, <strong className="text-white">Amazon</strong>, <strong className="text-white">Swiggy</strong>, and <strong className="text-white">Zomato</strong>, alongside global crypto platforms like <strong className="text-white">Binance</strong> and <strong className="text-white">Paytm</strong>.
                            </p>
                        </div>
                    </div>
                </div>

                {/* SECTION 3: Why Choose NexNum */}
                <div className="mb-24">
                    <div className="flex flex-col items-center text-center mb-12">
                        <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--neon-lime)/0.12)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center mb-4 shadow-lg shadow-[hsl(var(--neon-lime)/0.1)]">
                            <Sparkles className="h-6 w-6 text-[hsl(var(--neon-lime))]" />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                            Why Choose <span className="text-[hsl(var(--neon-lime))] neon-text-glow">NexNum</span> Over Other OTP Services?
                        </h2>
                        <p className="text-base text-gray-400 max-w-2xl mt-3 leading-relaxed">
                            Engineered with zero compromises on privacy, speed, and carrier reliability.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="rounded-3xl p-8 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 hover:border-[hsl(var(--neon-lime)/0.4)] transition-all">
                            <div className="w-10 h-10 rounded-xl bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] flex items-center justify-center font-bold mb-4">
                                <CreditCard className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Pay Per Number – No Subscription</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Enjoy total flexibility. You only pay for the exact numbers you activate. No monthly commitments, no recurring deductions, and wallet credits never expire.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="rounded-3xl p-8 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 hover:border-[hsl(var(--neon-lime)/0.4)] transition-all">
                            <div className="w-10 h-10 rounded-xl bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] flex items-center justify-center font-bold mb-4">
                                <Clock className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">20-Minute Validity & 99.9% Success Rate</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Every line stays active for a full 20 minutes, allowing you to receive multiple verification codes for your target service with industry-leading speed and 99.9% delivery reliability.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="rounded-3xl p-8 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 hover:border-[hsl(var(--neon-lime)/0.4)] transition-all">
                            <div className="w-10 h-10 rounded-xl bg-[hsl(var(--neon-lime)/0.15)] text-[hsl(var(--neon-lime))] flex items-center justify-center font-bold mb-4">
                                <Lock className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">100% Secure Indian Virtual Numbers</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Safeguard your digital identity against unwanted spam. All message transmissions are end-to-end encrypted and completely isolated from your personal mobile identity.
                            </p>
                        </div>
                    </div>
                </div>

                {/* SECTION 4: Pricing Architecture */}
                <div className="mb-24">
                    <div className="flex flex-col items-center text-center mb-12">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/10">
                            <Flame className="h-6 w-6 text-amber-400" />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                            Flexible Pricing for <span className="text-[hsl(var(--neon-lime))] neon-text-glow">Every Need</span>
                        </h2>
                        <p className="text-base text-gray-400 max-w-2xl mt-3 leading-relaxed">
                            Transparent per-verification rates tailored for personal use and developer automation.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="rounded-3xl p-8 bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all text-center">
                            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Essential Tier</span>
                            <h3 className="text-xl font-bold text-white mt-2 mb-4">Basic Services</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Optimized for lightweight verification needs including Telegram, secondary web portals, and standard messaging tools.
                            </p>
                        </div>

                        <div className="rounded-3xl p-8 bg-gradient-to-b from-[hsl(var(--neon-lime)/0.12)] to-white/[0.03] border border-[hsl(var(--neon-lime)/0.4)] shadow-xl shadow-[hsl(var(--neon-lime)/0.08)] text-center relative">
                            <span className="inline-block px-3 py-1 rounded-full bg-[hsl(var(--neon-lime))] text-black font-extrabold text-[10px] tracking-wider uppercase mb-3">
                                Most Popular
                            </span>
                            <h3 className="text-xl font-bold text-white mb-4">Social & Messaging</h3>
                            <p className="text-sm text-gray-300 leading-relaxed">
                                Dedicated high-priority numbers for WhatsApp, WhatsApp Business, Discord, TikTok, Instagram, and Twitter / X.
                            </p>
                        </div>

                        <div className="rounded-3xl p-8 bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all text-center">
                            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Pro Tier</span>
                            <h3 className="text-xl font-bold text-white mt-2 mb-4">AI & Enterprise</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Premium routes for Google / Gmail, OpenAI ChatGPT, Microsoft, Banking applications, and automated API workflows.
                            </p>
                        </div>
                    </div>
                </div>

                {/* SECTION 5: FAQs */}
                <div className="mb-20">
                    <div className="flex flex-col items-center text-center mb-12">
                        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mb-4 shadow-lg shadow-teal-500/10">
                            <HelpCircle className="h-6 w-6 text-teal-400" />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                            Frequently Asked Questions About <span className="text-[hsl(var(--neon-lime))] neon-text-glow">Virtual Numbers</span>
                        </h2>
                    </div>

                    <div className="space-y-6 max-w-4xl mx-auto">
                        <div className="rounded-2xl p-6 bg-white/[0.04] border border-white/10">
                            <h3 className="text-lg font-bold text-white mb-2">What is a virtual number?</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                A virtual number is an online disposable phone line capable of receiving SMS messages for account verification. It enables you to sign up for platforms without exposing your primary mobile number.
                            </p>
                        </div>

                        <div className="rounded-2xl p-6 bg-white/[0.04] border border-white/10">
                            <h3 className="text-lg font-bold text-white mb-2">Is it legal to use virtual numbers for OTP verification in India?</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Yes. NexNum routes real carrier lines strictly for standard account verification and testing purposes in compliance with terms of service protocols.
                            </p>
                        </div>

                        <div className="rounded-2xl p-6 bg-white/[0.04] border border-white/10">
                            <h3 className="text-lg font-bold text-white mb-2">What if the OTP SMS does not arrive?</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                If an OTP fails to deliver within 5 minutes, you can cancel the request with a single click and receive an automatic 100% refund straight to your wallet.
                            </p>
                        </div>

                        <div className="rounded-2xl p-6 bg-white/[0.04] border border-white/10">
                            <h3 className="text-lg font-bold text-white mb-2">Which payment options are supported?</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                We accept Indian UPI (Google Pay, PhonePe, Paytm), Net Banking, Debit/Credit cards, and major Cryptocurrencies for maximum convenience.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Call to Action Footer Banner */}
                <div className="relative rounded-3xl p-10 sm:p-14 bg-gradient-to-r from-[hsl(var(--neon-lime)/0.2)] via-white/[0.05] to-teal-500/10 border border-[hsl(var(--neon-lime)/0.4)] text-center overflow-hidden shadow-2xl">
                    <div className="absolute inset-0 bg-[hsl(var(--neon-lime)/0.05)] blur-2xl pointer-events-none" />
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-4 relative z-10">
                        Join 50,000+ Satisfied Users Across India
                    </h3>
                    <p className="text-sm sm:text-base text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed relative z-10">
                        Protect your personal privacy on unverified signups. Activate your instant Indian virtual number now.
                    </p>
                    <Link
                        href="/register"
                        className="inline-flex items-center justify-center h-14 px-10 font-bold bg-[hsl(var(--neon-lime))] text-black rounded-2xl hover:bg-[hsl(var(--neon-lime-soft))] transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.3)] hover:scale-105 relative z-10"
                    >
                        Get Virtual Number Now <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                </div>

            </div>
        </section>
    );
}
