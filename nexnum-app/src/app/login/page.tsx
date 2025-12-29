"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, ArrowLeft, Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { useState } from "react";
import AuthBackground from "@/components/auth/AuthBackground";
import AuthCard from "@/components/auth/AuthCard";

export default function LoginPage() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => setIsLoading(false), 2000);
    };

    return (
        <main className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
            <AuthBackground />

            {/* Content */}
            <div className="w-full max-w-md relative z-10">
                {/* Back to home */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-gray-400 hover:text-[hsl(var(--neon-lime))] transition-colors mb-8 text-sm group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Back to home
                    </Link>
                </motion.div>

                <AuthCard>
                    {/* Logo */}
                    <motion.div
                        className="flex items-center justify-center mb-8"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        <div className="relative">
                            <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--neon-lime)/0.3)] blur-xl" />
                            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.4)] to-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center border border-[hsl(var(--neon-lime)/0.3)]">
                                <Zap className="h-8 w-8 text-[hsl(var(--neon-lime))]" />
                            </div>
                        </div>
                    </motion.div>

                    {/* Header */}
                    <motion.div
                        className="text-center mb-8"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                    >
                        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Welcome back</h1>
                        <p className="text-gray-400 text-sm">Sign in to manage your virtual numbers</p>
                    </motion.div>

                    {/* Form */}
                    <motion.form
                        onSubmit={handleSubmit}
                        className="space-y-5"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    >
                        {/* Email */}
                        <div className="space-y-2">
                            <label className="text-sm text-gray-300 font-medium">Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="h-12 pl-11 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)] transition-all auth-input"
                                    required
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-gray-300 font-medium">Password</label>
                                <Link
                                    href="/forgot-password"
                                    className="text-xs text-[hsl(var(--neon-lime))] hover:text-[hsl(var(--neon-lime-soft))] hover:underline transition-colors"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-12 pl-11 pr-11 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)] transition-all auth-input"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Submit */}
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(var(--neon-lime-soft))] disabled:opacity-50 disabled:cursor-not-allowed neon-glow transition-all duration-300 shadow-xl shadow-[hsl(var(--neon-lime)/0.25)] group"
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                    Signing in...
                                </div>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </Button>
                    </motion.form>

                    {/* Divider */}
                    <motion.div
                        className="flex items-center gap-4 my-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.5 }}
                    >
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        <span className="text-xs text-gray-500">or continue with</span>
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </motion.div>

                    {/* Social login */}
                    <motion.div
                        className="grid grid-cols-2 gap-3"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                    >
                        <Button
                            variant="outline"
                            className="h-11 border-white/10 bg-white/[0.02] text-white hover:bg-white/[0.05] hover:border-white/20 text-sm transition-all"
                        >
                            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Google
                        </Button>
                        <Button
                            variant="outline"
                            className="h-11 border-white/10 bg-white/[0.02] text-white hover:bg-white/[0.05] hover:border-white/20 text-sm transition-all"
                        >
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                            GitHub
                        </Button>
                    </motion.div>

                    {/* Sign up link */}
                    <motion.p
                        className="text-center text-sm text-gray-400 mt-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.7 }}
                    >
                        Don't have an account?{" "}
                        <Link
                            href="/register"
                            className="text-[hsl(var(--neon-lime))] font-medium hover:text-[hsl(var(--neon-lime-soft))] hover:underline transition-colors"
                        >
                            Sign up free
                        </Link>
                    </motion.p>
                </AuthCard>
            </div>
        </main>
    );
}
