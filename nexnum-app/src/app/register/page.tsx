"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, ArrowLeft, Eye, EyeOff, Mail, Lock, User, ArrowRight, Check, Smartphone, Shield, Globe, Clock, AlertCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import AuthBackground from "@/components/auth/AuthBackground";
import AuthCard from "@/components/auth/AuthCard";
import Auth3DLaptop from "@/components/auth/Auth3DLaptop";
import Navbar from "@/components/layout/Navbar";
import { useAuthStore } from "@/stores/authStore";
import LoadingScreen from "@/components/ui/LoadingScreen";

const features = [
    { icon: Shield, label: "Bank-grade encryption" },
    { icon: Globe, label: "50+ countries supported" },
    { icon: Clock, label: "Instant SMS delivery" }
];

export default function RegisterPage() {
    const router = useRouter();
    const { register, isLoading, error, clearError, isAuthenticated, checkAuth } = useAuthStore();

    const [showPassword, setShowPassword] = useState(false);
    const [step, setStep] = useState(1);
    const [isMobile, setIsMobile] = useState(false);
    const [formData, setFormData] = useState({ name: "", email: "", password: "" });
    const [otp, setOtp] = useState(["", "", "", "", "", ""]);
    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

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

    if (isLoading && !isAuthenticated) {
        return <LoadingScreen status="Initializing Environment" />
    }

    if (isAuthenticated) {
        return <LoadingScreen status="Preparing Workspace" />
    }

    const handleOtpChange = (index: number, value: string) => {
        if (value.length > 1) return;
        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);
        if (value && index < 5) otpRefs.current[index + 1]?.focus();
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        if (step === 1) {
            setStep(2);
        } else if (step === 2) {
            // Validate password requirements for backend
            const { password } = formData;
            if (password.length < 8) {
                return; // Let the browser handle validation
            }
            if (!/[A-Z]/.test(password)) {
                return;
            }
            if (!/[a-z]/.test(password)) {
                return;
            }
            if (!/[0-9]/.test(password)) {
                return;
            }

            // Register the user
            const success = await register(formData.name, formData.email, formData.password);
            if (success) {
                router.push("/dashboard");
            }
        }
    };

    const getPasswordStrength = () => {
        const { password } = formData;
        if (password.length === 0) return 0;
        if (password.length < 8) return 1;

        let strength = 1;
        if (/[A-Z]/.test(password)) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;

        return strength;
    };

    const strengthColors = ["", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400"];
    const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];

    const renderForm = () => (
        <>
            {/* Progress steps */}
            <div className="flex items-center justify-center gap-2 mb-6 lg:mb-8">
                {[1, 2].map((s) => (
                    <div key={s} className="flex items-center">
                        <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center text-xs lg:text-sm font-bold transition-all ${s < step ? "bg-[hsl(var(--neon-lime))] text-black" : s === step ? "bg-[hsl(var(--neon-lime)/0.2)] text-[hsl(var(--neon-lime))] border border-[hsl(var(--neon-lime)/0.5)]" : "bg-white/5 text-gray-500 border border-white/10"}`}>
                            {s < step ? <Check className="w-4 h-4" /> : s}
                        </div>
                        {s < 2 && <div className={`w-6 lg:w-10 h-0.5 mx-1 ${s < step ? "bg-[hsl(var(--neon-lime))]" : "bg-white/10"}`} />}
                    </div>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-5">
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 lg:space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm text-gray-300 font-medium">Full Name</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                    <Input type="text" placeholder="John Doe" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-12 lg:h-14 pl-11 lg:pl-12 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]" required />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm text-gray-300 font-medium">Email</label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                    <Input type="email" placeholder="you@example.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="h-12 lg:h-14 pl-11 lg:pl-12 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]" required />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 lg:space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm text-gray-300 font-medium">Password</label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                                    <Input type={showPassword ? "text" : "password"} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="h-12 lg:h-14 pl-11 lg:pl-12 pr-11 bg-white/[0.03] border-white/10 text-white placeholder:text-gray-500 focus:border-[hsl(var(--neon-lime)/0.5)] focus:ring-[hsl(var(--neon-lime)/0.2)]" required />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                        {showPassword ? <EyeOff className="w-4 h-4 lg:w-5 lg:h-5" /> : <Eye className="w-4 h-4 lg:w-5 lg:h-5" />}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= getPasswordStrength() ? strengthColors[getPasswordStrength()] : "bg-white/10"}`} />
                                    ))}
                                </div>
                                {getPasswordStrength() > 0 && <p className={`text-xs ${getPasswordStrength() === 4 ? "text-green-400" : getPasswordStrength() === 3 ? "text-yellow-400" : getPasswordStrength() === 2 ? "text-orange-400" : "text-red-400"}`}>{strengthLabels[getPasswordStrength()]} password</p>}
                                <p className="text-xs text-gray-500">Must be 8+ characters with uppercase, lowercase, and number</p>
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                    <p className="text-sm text-red-400">{error}</p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex gap-3 pt-2">
                    {step > 1 && <Button type="button" variant="outline" onClick={() => setStep(step - 1)} className="flex-1 h-12 lg:h-14 border-white/10 bg-white/[0.02] text-white hover:bg-white/[0.05]">Back</Button>}
                    <Button type="submit" disabled={isLoading} className="flex-1 h-12 lg:h-14 bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(var(--neon-lime-soft))] disabled:opacity-50 neon-glow shadow-lg shadow-[hsl(var(--neon-lime)/0.25)]">
                        {isLoading ? <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Creating...</div> : <>{step === 2 ? "Create Account" : "Continue"}{step < 2 && <ArrowRight className="ml-2 w-4 h-4" />}</>}
                    </Button>
                </div>
            </form>

            {step === 1 && (
                <>
                    <div className="flex items-center gap-4 my-6">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        <span className="text-xs text-gray-500">or continue with</span>
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <Button variant="outline" onClick={() => window.location.href = '/api/auth/google'} className="h-11 border-white/10 bg-white/[0.02] text-white hover:bg-white/[0.05] text-sm">
                            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                            Google
                        </Button>
                        <Button variant="outline" className="h-11 border-white/10 bg-white/[0.02] text-white hover:bg-white/[0.05] text-sm">
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                            GitHub
                        </Button>
                    </div>
                </>
            )}

            <p className="text-center text-sm text-gray-400">Already have an account? <Link href="/login" className="text-[hsl(var(--neon-lime))] font-medium hover:underline">Sign in</Link></p>
        </>
    );

    return (
        <main className="min-h-screen relative overflow-hidden">
            <AuthBackground />

            <div className="relative z-10 min-h-screen">
                {isMobile ? (
                    <div className="flex flex-col min-h-screen px-4 py-8">
                        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                            <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-[hsl(var(--neon-lime))] transition-colors mb-6 text-sm group">
                                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />Back
                            </Link>
                        </motion.div>

                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-full max-w-sm">
                                <AuthCard>
                                    <motion.div className="flex items-center justify-center mb-5" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
                                        <div className="relative">
                                            <div className="absolute inset-0 rounded-2xl bg-[hsl(var(--neon-lime)/0.3)] blur-xl" />
                                            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.4)] to-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center border border-[hsl(var(--neon-lime)/0.3)]">
                                                <Image
                                                    src="/logos/nexnum-logo.svg"
                                                    alt="NexNum"
                                                    width={38}
                                                    height={38}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                    <motion.div className="text-center mb-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                        <h1 className="text-xl font-bold text-white mb-1">{step === 1 ? "Create account" : step === 2 ? "Set password" : "Verify email"}</h1>
                                        <p className="text-gray-400 text-sm">{step === 1 ? "Start your free trial" : step === 2 ? "Choose a strong password" : "Enter the code we sent"}</p>
                                    </motion.div>
                                    {renderForm()}
                                </AuthCard>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <Navbar hideRegister />
                        <div className="flex min-h-screen">
                            <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 items-center justify-center relative">

                                <div className="relative">
                                    <Auth3DLaptop />
                                </div>
                            </div>

                            <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-8 lg:p-12">
                                <motion.div className="w-full max-w-md" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
                                    <div className="mb-8">
                                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                            <h1 className="text-3xl xl:text-4xl font-bold text-white mb-2">{step === 1 ? "Create your account" : step === 2 ? "Secure your account" : "Verify your email"}</h1>
                                            <p className="text-gray-400">{step === 1 ? "Start verifying with virtual numbers today" : step === 2 ? "Choose a strong password to protect your account" : `We sent a verification code to ${formData.email}`}</p>
                                        </motion.div>
                                    </div>

                                    {renderForm()}
                                </motion.div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
