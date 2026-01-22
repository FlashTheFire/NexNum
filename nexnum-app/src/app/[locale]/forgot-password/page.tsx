"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Mail, ArrowRight, CheckCircle, AlertCircle, Sparkles, Shield, KeyRound } from "lucide-react";
import { useState, useEffect } from "react";
import AuthBackground from "@/components/auth/AuthBackground";
import AuthCard from "@/components/auth/AuthCard";
import Auth3DLaptop from "@/components/auth/Auth3DLaptop";
import Navbar from "@/components/layout/Navbar";

export default function ForgotPasswordPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            setIsSuccess(true);
        } catch (err) {
            setError("Something went wrong. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const renderSuccess = () => (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-8"
        >
            <motion.div
                className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[hsl(var(--neon-lime)/0.2)] to-[hsl(var(--neon-lime)/0.05)] flex items-center justify-center border border-[hsl(var(--neon-lime)/0.3)] shadow-lg shadow-[hsl(var(--neon-lime)/0.15)]"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
            >
                <CheckCircle className="w-10 h-10 text-[hsl(var(--neon-lime))]" />
            </motion.div>

            <div className="space-y-3">
                <h2 className="text-2xl font-bold text-white">Check your email</h2>
                <p className="text-gray-400">
                    We've sent password reset instructions to <br />
                    <span className="text-white font-medium">{email}</span>
                </p>
            </div>

            <Button
                onClick={() => router.push('/login')}
                className="w-full h-14 bg-white/[0.05] text-white hover:bg-white/10 font-semibold border border-white/10 rounded-xl transition-all duration-300"
            >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Sign in
            </Button>

            <p className="text-sm text-gray-500">
                Didn't receive the email?{" "}
                <button
                    disabled={isLoading}
                    onClick={handleSubmit}
                    className="text-[hsl(var(--neon-lime))] hover:underline disabled:opacity-50 font-medium"
                >
                    Resend
                </button>
            </p>
        </motion.div>
    );

    const renderForm = () => (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-3">
                <label className="text-sm text-gray-300 font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-500" />
                    Email address
                </label>
                <div className="relative group">
                    <Input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-14 pl-5 pr-5 text-base bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-2 focus:ring-[hsl(var(--neon-lime)/0.15)] transition-all rounded-xl"
                        required
                    />
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[hsl(var(--neon-lime)/0.1)] to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                </div>
            </div>

            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400"
                    >
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm">{error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 text-base bg-gradient-to-r from-[hsl(var(--neon-lime))] to-[hsl(var(--neon-lime-soft))] text-black font-bold hover:opacity-90 disabled:opacity-50 transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.25)] rounded-xl group relative overflow-hidden"
            >
                <span className="relative z-10 flex items-center justify-center gap-2">
                    {isLoading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            Sending Link...
                        </>
                    ) : (
                        <>
                            Send Reset Link
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </Button>

            <div className="text-center pt-2">
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Sign in
                </Link>
            </div>
        </form>
    );

    return (
        <main className="min-h-screen relative overflow-hidden">
            <AuthBackground />

            <div className="relative z-10 min-h-screen">
                {isMobile ? (
                    /* Mobile Layout */
                    <div className="flex flex-col min-h-screen px-4 py-8">
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                            <Link href="/login" className="inline-flex items-center gap-2 text-gray-400 hover:text-[hsl(var(--neon-lime))] transition-colors mb-6 text-sm group">
                                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                                Back
                            </Link>
                        </motion.div>

                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-full max-w-sm">
                                <AuthCard>
                                    <motion.div className="flex items-center justify-center mb-6" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
                                        <div className="relative">
                                            <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--neon-lime)/0.3)] blur-xl" />
                                            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.4)] to-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center border border-[hsl(var(--neon-lime)/0.3)]">
                                                <Image src="/logos/nexnum-logo.svg" alt="NexNum" width={38} height={38} />
                                            </div>
                                        </div>
                                    </motion.div>

                                    {!isSuccess && (
                                        <motion.div className="text-center mb-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                                            <h1 className="text-2xl font-bold text-white mb-2">Forgot Password?</h1>
                                            <p className="text-gray-400 text-sm">Enter your email to reset your password</p>
                                        </motion.div>
                                    )}

                                    {isSuccess ? renderSuccess() : renderForm()}
                                </AuthCard>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Desktop Layout - Premium High-Tech Design */
                    <>
                        <Navbar hideLogin />
                        <div className="flex min-h-screen">
                            {/* Left side - 3D Showcase */}
                            <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 items-center justify-center relative">
                                {/* Animated grid lines */}
                                <div className="absolute inset-0 overflow-hidden opacity-20">
                                    <div className="absolute inset-0" style={{
                                        backgroundImage: `
                                            linear-gradient(to right, hsl(var(--neon-lime) / 0.1) 1px, transparent 1px),
                                            linear-gradient(to bottom, hsl(var(--neon-lime) / 0.1) 1px, transparent 1px)
                                        `,
                                        backgroundSize: '60px 60px'
                                    }} />
                                </div>

                                {/* Floating orbs */}
                                <motion.div
                                    className="absolute top-20 left-20 w-32 h-32 rounded-full bg-[hsl(var(--neon-lime)/0.05)] blur-3xl"
                                    animate={{
                                        y: [0, 30, 0],
                                        opacity: [0.3, 0.6, 0.3]
                                    }}
                                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <motion.div
                                    className="absolute bottom-32 right-32 w-48 h-48 rounded-full bg-[hsl(180,60%,40%)/0.05] blur-3xl"
                                    animate={{
                                        y: [0, -40, 0],
                                        opacity: [0.2, 0.5, 0.2]
                                    }}
                                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                                />

                                <div className="relative">
                                    <Auth3DLaptop />
                                </div>
                            </div>

                            {/* Right side - Form */}
                            <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-8 lg:p-12 relative">
                                {/* Decorative accent */}
                                <div className="absolute top-8 right-8">
                                    <motion.div
                                        className="w-3 h-3 rounded-full bg-[hsl(var(--neon-lime))]"
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    />
                                </div>

                                <motion.div
                                    className="w-full max-w-md"
                                    initial={{ opacity: 0, x: 40 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.6 }}
                                >
                                    {/* Premium Card Container */}
                                    <div className="relative">
                                        {/* Glow effect behind card */}
                                        <div className="absolute -inset-1 bg-gradient-to-r from-[hsl(var(--neon-lime)/0.1)] via-transparent to-[hsl(180,60%,40%)/0.1] rounded-3xl blur-xl opacity-60" />

                                        <div className="relative bg-[#0a0a0c]/90 backdrop-blur-2xl p-10 rounded-3xl border border-white/[0.08] shadow-2xl">
                                            {/* Premium badge */}
                                            <motion.div
                                                className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#0a0a0c] border border-white/10 shadow-lg"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.3 }}
                                            >
                                                <Shield className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))]" />
                                                <span className="text-xs text-gray-400 font-medium">Secure Recovery</span>
                                            </motion.div>

                                            {!isSuccess ? (
                                                <>
                                                    {/* Header */}
                                                    <div className="mb-10 pt-4">
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 20 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            transition={{ delay: 0.2 }}
                                                            className="space-y-3"
                                                        >
                                                            <div className="flex items-center gap-3 mb-4">
                                                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.2)] to-[hsl(var(--neon-lime)/0.05)] flex items-center justify-center border border-[hsl(var(--neon-lime)/0.2)]">
                                                                    <KeyRound className="w-6 h-6 text-[hsl(var(--neon-lime))]" />
                                                                </div>
                                                            </div>
                                                            <h1 className="text-3xl xl:text-4xl font-bold text-white tracking-tight">
                                                                Forgot Password?
                                                            </h1>
                                                            <p className="text-gray-400 text-lg">
                                                                Don't worry, it happens to the best of us.
                                                            </p>
                                                        </motion.div>
                                                    </div>

                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        transition={{ delay: 0.4 }}
                                                    >
                                                        {renderForm()}
                                                    </motion.div>

                                                    {/* Bottom decoration */}
                                                    <motion.div
                                                        className="mt-10 pt-8 border-t border-white/5"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        transition={{ delay: 0.6 }}
                                                    >
                                                        <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))]" />
                                                                <span>256-bit encryption</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                                                <span>Secure tokens</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                                                <span>Instant delivery</span>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                </>
                                            ) : (
                                                <div className="py-4">
                                                    {renderSuccess()}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
