"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, ArrowLeft, Eye, EyeOff, Mail, Lock, User, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function RegisterPage() {
    const [showPassword, setShowPassword] = useState(false);
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
    });

    return (
        <main className="min-h-screen bg-gradient-to-br from-[#0a0a0c] via-[#0d1f1f] to-[#0a0a0c] flex items-center justify-center px-4 py-12 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full bg-[hsl(var(--neon-lime)/0.08)] blur-[120px]" />
                <div className="absolute bottom-1/3 left-1/4 w-80 h-80 rounded-full bg-[hsl(180,50%,12%,0.3)] blur-[100px]" />
            </div>

            {/* Content */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-md relative z-10"
            >
                {/* Back to home */}
                <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 text-sm">
                    <ArrowLeft className="w-4 h-4" />
                    Back to home
                </Link>

                {/* Card */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-8 shadow-2xl">
                    {/* Logo */}
                    <div className="flex items-center justify-center mb-8">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.3)] to-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center shadow-lg shadow-[hsl(var(--neon-lime)/0.2)]">
                            <Zap className="h-7 w-7 text-[hsl(var(--neon-lime))]" />
                        </div>
                    </div>

                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-white mb-2">Create your account</h1>
                        <p className="text-gray-400 text-sm">Start verifying with virtual numbers today</p>
                    </div>

                    {/* Progress steps */}
                    <div className="flex items-center justify-center gap-2 mb-8">
                        {[1, 2, 3].map((s) => (
                            <div
                                key={s}
                                className={`h-1.5 rounded-full transition-all duration-300 ${s === step
                                        ? "w-8 bg-[hsl(var(--neon-lime))]"
                                        : s < step
                                            ? "w-4 bg-[hsl(var(--neon-lime)/0.5)]"
                                            : "w-4 bg-white/10"
                                    }`}
                            />
                        ))}
                    </div>

                    {/* Form */}
                    <form className="space-y-5">
                        {step === 1 && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="space-y-5"
                            >
                                {/* Name */}
                                <div className="space-y-2">
                                    <label className="text-sm text-gray-300 font-medium">Full Name</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                        <Input
                                            type="text"
                                            placeholder="John Doe"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="h-12 pl-11 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]"
                                        />
                                    </div>
                                </div>

                                {/* Email */}
                                <div className="space-y-2">
                                    <label className="text-sm text-gray-300 font-medium">Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                        <Input
                                            type="email"
                                            placeholder="you@example.com"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            className="h-12 pl-11 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="space-y-5"
                            >
                                {/* Password */}
                                <div className="space-y-2">
                                    <label className="text-sm text-gray-300 font-medium">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="••••••••"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            className="h-12 pl-11 pr-11 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500">Must be at least 8 characters</p>
                                </div>

                                {/* Password strength indicator */}
                                <div className="space-y-2">
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4].map((i) => (
                                            <div
                                                key={i}
                                                className={`h-1 flex-1 rounded-full ${formData.password.length >= i * 2
                                                        ? formData.password.length >= 8
                                                            ? "bg-green-400"
                                                            : "bg-yellow-400"
                                                        : "bg-white/10"
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="space-y-5"
                            >
                                {/* Verification code */}
                                <div className="text-center space-y-4">
                                    <div className="w-16 h-16 mx-auto rounded-full bg-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center">
                                        <Mail className="w-8 h-8 text-[hsl(var(--neon-lime))]" />
                                    </div>
                                    <div>
                                        <p className="text-gray-300 mb-1">We sent a code to</p>
                                        <p className="text-white font-medium">{formData.email || "your email"}</p>
                                    </div>
                                </div>

                                {/* OTP inputs */}
                                <div className="flex justify-center gap-3">
                                    {[1, 2, 3, 4, 5, 6].map((i) => (
                                        <Input
                                            key={i}
                                            type="text"
                                            maxLength={1}
                                            className="w-11 h-12 text-center text-lg font-bold bg-white/[0.03] border-white/10 text-white focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]"
                                        />
                                    ))}
                                </div>

                                <p className="text-center text-sm text-gray-400">
                                    Didn't receive code?{" "}
                                    <button type="button" className="text-[hsl(var(--neon-lime))] hover:underline">
                                        Resend
                                    </button>
                                </p>
                            </motion.div>
                        )}

                        {/* Navigation buttons */}
                        <div className="flex gap-3 pt-2">
                            {step > 1 && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setStep(step - 1)}
                                    className="flex-1 h-12 border-white/10 text-white hover:bg-white/5"
                                >
                                    Back
                                </Button>
                            )}
                            <Button
                                type="button"
                                onClick={() => (step < 3 ? setStep(step + 1) : null)}
                                className="flex-1 h-12 bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(var(--neon-lime-soft))] neon-glow transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.25)]"
                            >
                                {step === 3 ? "Create Account" : "Continue"}
                                {step < 3 && <ArrowRight className="ml-2 w-4 h-4" />}
                            </Button>
                        </div>
                    </form>

                    {/* Divider (step 1 only) */}
                    {step === 1 && (
                        <>
                            <div className="flex items-center gap-4 my-6">
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-xs text-gray-500">or continue with</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>

                            {/* Social signup */}
                            <div className="grid grid-cols-2 gap-3">
                                <Button variant="outline" className="h-11 border-white/10 text-white hover:bg-white/5 text-sm">
                                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    Google
                                </Button>
                                <Button variant="outline" className="h-11 border-white/10 text-white hover:bg-white/5 text-sm">
                                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                    </svg>
                                    GitHub
                                </Button>
                            </div>
                        </>
                    )}

                    {/* Login link */}
                    <p className="text-center text-sm text-gray-400 mt-6">
                        Already have an account?{" "}
                        <Link href="/login" className="text-[hsl(var(--neon-lime))] font-medium hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>

                {/* Terms */}
                <p className="text-center text-xs text-gray-500 mt-6">
                    By creating an account, you agree to our{" "}
                    <Link href="/terms" className="text-gray-400 hover:text-white">Terms of Service</Link>
                    {" "}and{" "}
                    <Link href="/privacy" className="text-gray-400 hover:text-white">Privacy Policy</Link>
                </p>
            </motion.div>
        </main>
    );
}
