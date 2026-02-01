"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, ArrowLeft, Eye, EyeOff, Mail, Lock, ArrowRight, Shield, Globe, Clock, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import AuthBackground from "@/components/auth/AuthBackground";
import AuthCard from "@/components/auth/AuthCard";
import Auth3DLaptop from "@/components/auth/Auth3DLaptop";
import Navbar from "@/components/layout/Navbar";
import { useAuthStore } from "@/stores/authStore";
import LoadingScreen from "@/components/ui/LoadingScreen";
import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";
import { Captcha } from "@/components/auth/Captcha";

export default function LoginPage() {
    const router = useRouter();
    const { login, isLoading, error, clearError, isAuthenticated, checkAuth, requires2Fa, verify2Fa } = useAuthStore();

    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isMobile, setIsMobile] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [captchaToken, setCaptchaToken] = useState("");

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        if (isAuthenticated) {
            router.push("/dashboard");
        }
    }, [isAuthenticated, router]);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    if (isLoading && !isAuthenticated && !requires2Fa) {
        return <LoadingScreen status="Verifying Protocol" />
    }

    if (isAuthenticated) {
        return <LoadingScreen status="Redirecting to Workspace" />
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        await login(email, password, captchaToken);
    };

    const handleVerify2Fa = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        const success = await verify2Fa(twoFactorCode);
        if (success) {
            router.push("/dashboard");
        }
    };

    return (
        <main className="min-h-screen relative overflow-hidden">
            <AuthBackground />

            {/* Content */}
            <div className="relative z-10 min-h-screen">
                {isMobile ? (
                    /* Mobile Layout */
                    <div className="flex flex-col min-h-screen px-4 py-8">
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                            <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-[hsl(var(--neon-lime))] transition-colors mb-6 text-sm group">
                                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                                Back
                            </Link>
                        </motion.div>

                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-full max-w-sm">
                                <AuthCard>
                                    {/* Logo */}
                                    <motion.div className="flex items-center justify-center mb-6" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
                                        <div className="relative">
                                            <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--neon-lime)/0.3)] blur-xl" />
                                            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.4)] to-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center border border-[hsl(var(--neon-lime)/0.3)]">
                                                <Image
                                                    src="/assets/brand/nexnum-logo.svg"
                                                    alt="NexNum"
                                                    width={38}
                                                    height={38}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>

                                    {requires2Fa ? (
                                        <motion.div className="text-center mb-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                                            <h1 className="text-2xl font-bold text-white mb-2">Two-Factor Authentication</h1>
                                            <p className="text-gray-400 text-sm">Enter the code from your app</p>
                                        </motion.div>
                                    ) : (
                                        <motion.div className="text-center mb-6" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                                            <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
                                            <p className="text-gray-400 text-sm">Sign in to your account</p>
                                        </motion.div>
                                    )}

                                    <form onSubmit={requires2Fa ? handleVerify2Fa : handleSubmit} className="space-y-4">
                                        {requires2Fa ? (
                                            <div className="space-y-2">
                                                <Input
                                                    type="text"
                                                    placeholder="000 000"
                                                    value={twoFactorCode}
                                                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                                    className="h-12 text-center text-xl tracking-[0.5em] bg-white/[0.03] border-white/10 text-white placeholder:text-gray-600 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]"
                                                    maxLength={6}
                                                    autoFocus
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-sm text-gray-300 font-medium">Email</label>
                                                    <div className="relative group">
                                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                                        <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-11 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]" required />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm text-gray-300 font-medium">Password</label>
                                                        <Link href="/forgot-password" className="text-xs text-[hsl(var(--neon-lime))] hover:underline">Forgot?</Link>
                                                    </div>
                                                    <div className="relative group">
                                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                                        <Input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-11 pr-11 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]" required />
                                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {error && (
                                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                <span>{error}</span>
                                            </div>
                                        )}

                                        <Captcha onVerify={setCaptchaToken} className="my-2" />

                                        <Button type="submit" disabled={isLoading} className="w-full h-12 bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(var(--neon-lime-soft))] disabled:opacity-50 neon-glow transition-all shadow-lg shadow-[hsl(var(--neon-lime)/0.25)]">
                                            {isLoading ? <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />{requires2Fa ? 'Verifying...' : 'Signing in...'}</div> : <>{requires2Fa ? 'Verify Code' : 'Sign In'}<ArrowRight className="ml-2 w-4 h-4" /></>}
                                        </Button>
                                    </form>

                                    <SocialLoginButtons mode="login" />

                                    <p className="text-center text-sm text-gray-400 mt-5">
                                        Don't have an account? <Link href="/register" className="text-[hsl(var(--neon-lime))] font-medium hover:underline">Sign up</Link>
                                    </p>
                                </AuthCard>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Desktop Layout - Split Screen */
                    <>
                        <Navbar hideLogin />
                        <div className="flex min-h-screen">
                            {/* Left side - 3D Tablet showcase */}
                            <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 items-center justify-center relative">

                                {/* Content */}
                                <div className="relative">
                                    {/* 3D Laptop */}
                                    <Auth3DLaptop />
                                </div>
                            </div>

                            {/* Right side - Login form */}
                            <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-8 lg:p-12">
                                <motion.div
                                    className="w-full max-w-md"
                                    initial={{ opacity: 0, x: 40 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.6 }}
                                >
                                    {/* Header */}
                                    <div className="mb-10">
                                        {requires2Fa ? (
                                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                                <h1 className="text-3xl xl:text-4xl font-bold text-white mb-3">Two-Factor Authentication</h1>
                                                <p className="text-gray-400">Enter the 6-digit code from your app</p>
                                            </motion.div>
                                        ) : (
                                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                                <h1 className="text-3xl xl:text-4xl font-bold text-white mb-3">Welcome back</h1>
                                                <p className="text-gray-400">Sign in to manage your virtual numbers</p>
                                            </motion.div>
                                        )}
                                    </div>

                                    {/* Form */}
                                    <motion.form onSubmit={requires2Fa ? handleVerify2Fa : handleSubmit} className="space-y-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                                        {requires2Fa ? (
                                            <div className="space-y-2">
                                                <Input
                                                    type="text"
                                                    placeholder="000 000"
                                                    value={twoFactorCode}
                                                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                                    className="h-14 text-center text-3xl tracking-[0.5em] bg-white/[0.03] border-white/10 text-white placeholder:text-gray-600 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-2 focus:ring-[hsl(var(--neon-lime)/0.2)] transition-all font-mono"
                                                    maxLength={6}
                                                    autoFocus
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-sm text-gray-300 font-medium">Email address</label>
                                                    <div className="relative group">
                                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                                        <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-14 pl-12 text-base bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-2 focus:ring-[hsl(var(--neon-lime)/0.2)] transition-all" required />
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-sm text-gray-300 font-medium">Password</label>
                                                        <Link href="/forgot-password" className="text-sm text-[hsl(var(--neon-lime))] hover:text-[hsl(var(--neon-lime-soft))] hover:underline transition-colors">Forgot password?</Link>
                                                    </div>
                                                    <div className="relative group">
                                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                                        <Input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-14 pl-12 pr-12 text-base bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-2 focus:ring-[hsl(var(--neon-lime)/0.2)] transition-all" required />
                                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {error && (
                                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                <span>{error}</span>
                                            </div>
                                        )}

                                        <Captcha onVerify={setCaptchaToken} className="my-2" />

                                        <Button type="submit" disabled={isLoading} className="w-full h-14 text-base bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(var(--neon-lime-soft))] disabled:opacity-50 neon-glow transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.3)] group">
                                            {isLoading ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                                    {requires2Fa ? 'Verifying...' : 'Signing in...'}
                                                </div>
                                            ) : (
                                                <>{requires2Fa ? 'Verify Code' : 'Sign In'}<ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" /></>
                                            )}
                                        </Button>
                                    </motion.form>

                                    <SocialLoginButtons mode="login" />

                                    {/* Sign up link */}
                                    <motion.p className="text-center text-gray-400 mt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                                        Don't have an account?{" "}
                                        <Link href="/register" className="text-[hsl(var(--neon-lime))] font-medium hover:text-[hsl(var(--neon-lime-soft))] hover:underline transition-colors">
                                            Create free account
                                        </Link>
                                    </motion.p>

                                </motion.div>
                            </div>
                        </div>

                    </>
                )}
            </div>
        </main >
    );
}
