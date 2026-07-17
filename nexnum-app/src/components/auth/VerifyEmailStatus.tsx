"use client";

import { motion } from "framer-motion";
import { Mail, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";

type StatusType = "pending" | "loading" | "success" | "error" | "expired";

interface VerifyEmailStatusProps {
    status: StatusType;
    email?: string;
    errorMessage?: string;
    onResend?: () => void;
    onSignOut?: () => void;
    isResending?: boolean;
    cooldown?: number;
}

export default function VerifyEmailStatus({
    status,
    email,
    errorMessage,
    onResend,
    onSignOut,
    isResending = false,
    cooldown = 0,
}: VerifyEmailStatusProps) {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        // Check if user prefers reduced motion
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        setPrefersReducedMotion(mediaQuery.matches);

        const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
    }, []);

    // Animation variants - respect prefers-reduced-motion
    const iconVariants = prefersReducedMotion
        ? {
            loading: { transition: { duration: 0 } },
            success: { opacity: 1, scale: 1 },
            error: { transition: { duration: 0 } },
            expired: { transition: { duration: 0 } },
        }
        : {
            loading: {
                rotate: 360,
                transition: { duration: 2, repeat: Infinity, ease: "linear" },
            },
            success: {
                scale: [0, 1.1, 1],
                opacity: [0, 1, 1],
                transition: { duration: 0.6, ease: "backOut" },
            },
            error: {
                x: [-10, 10, -10, 0],
                transition: { duration: 0.4 },
            },
            expired: {
                rotate: [0, 5, -5, 0],
                transition: { duration: 0.5 },
            },
        };

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.5, staggerChildren: 0.1 },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 },
    };

    return (
        <motion.div
            className="text-center space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            {/* Icon Section */}
            <motion.div className="flex justify-center" variants={itemVariants}>
                {status === "pending" && (
                    <div className="relative w-20 h-20" aria-label="Waiting for email verification">
                        {/* Pulsing background circle */}
                        <motion.div
                            className="absolute inset-0 rounded-full bg-[hsl(var(--neon-lime)/0.15)]"
                            animate={prefersReducedMotion ? {} : { scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                            transition={prefersReducedMotion ? {} : { duration: 2, repeat: Infinity }}
                        />
                        {/* Icon container */}
                        <div className="relative flex items-center justify-center w-20 h-20 bg-[hsl(var(--neon-lime)/0.1)] rounded-full border-2 border-[hsl(var(--neon-lime)/0.5)]">
                            <Mail className="h-10 w-10 text-[hsl(var(--neon-lime))]" aria-hidden="true" />
                        </div>
                    </div>
                )}

                {status === "loading" && (
                    <motion.div
                        className="relative w-20 h-20"
                        variants={iconVariants}
                        animate="loading"
                        aria-label="Verifying your email"
                    >
                        <div className="relative flex items-center justify-center w-20 h-20 bg-[hsl(var(--neon-lime)/0.1)] rounded-full border-2 border-[hsl(var(--neon-lime)/0.5)]">
                            <Loader2 className="h-10 w-10 text-[hsl(var(--neon-lime))]" aria-hidden="true" />
                        </div>
                        {/* Glow effect */}
                        <div
                            className="absolute inset-0 rounded-full"
                            style={{
                                boxShadow: "0 0 20px rgba(188,255,0,0.3)",
                            }}
                        />
                    </motion.div>
                )}

                {status === "success" && (
                    <motion.div
                        className="relative w-20 h-20"
                        variants={iconVariants}
                        animate="success"
                        aria-label="Email verification successful"
                    >
                        <div className="relative flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full border-2 border-green-500/50">
                            <CheckCircle2 className="h-10 w-10 text-green-500" aria-hidden="true" />
                        </div>
                    </motion.div>
                )}

                {status === "error" && (
                    <motion.div
                        className="relative w-20 h-20"
                        variants={iconVariants}
                        animate="error"
                        aria-label="Email verification failed"
                    >
                        <div className="relative flex items-center justify-center w-20 h-20 bg-red-500/10 rounded-full border-2 border-red-500/50">
                            <XCircle className="h-10 w-10 text-red-500" aria-hidden="true" />
                        </div>
                    </motion.div>
                )}

                {status === "expired" && (
                    <motion.div
                        className="relative w-20 h-20"
                        variants={iconVariants}
                        animate="expired"
                        aria-label="Verification link expired"
                    >
                        <div className="relative flex items-center justify-center w-20 h-20 bg-yellow-500/10 rounded-full border-2 border-yellow-500/50">
                            <Clock className="h-10 w-10 text-yellow-500" aria-hidden="true" />
                        </div>
                    </motion.div>
                )}
            </motion.div>

            {/* Text Content */}
            <motion.div className="space-y-2" variants={itemVariants}>
                {status === "pending" && (
                    <>
                        <h2 className="text-2xl md:text-3xl font-bold text-white">
                            Check Your <span className="text-[hsl(var(--neon-lime))]">Inbox</span>
                        </h2>
                        <p className="text-gray-400">We've sent a verification link to</p>
                    </>
                )}

                {status === "loading" && (
                    <>
                        <h2 className="text-2xl md:text-3xl font-bold text-white">
                            <span className="text-[hsl(var(--neon-lime))]">Verifying</span> Email
                        </h2>
                        <p className="text-gray-400">Please hold on while we verify your address...</p>
                    </>
                )}

                {status === "success" && (
                    <>
                        <h2 className="text-2xl md:text-3xl font-bold text-white">
                            Email <span className="text-green-500">Verified!</span>
                        </h2>
                        <p className="text-gray-400">Your email has been successfully verified</p>
                    </>
                )}

                {status === "error" && (
                    <>
                        <h2 className="text-2xl md:text-3xl font-bold text-white">
                            Verification <span className="text-red-500">Failed</span>
                        </h2>
                        <p className="text-gray-400">{errorMessage || "Unable to verify your email."}</p>
                    </>
                )}

                {status === "expired" && (
                    <>
                        <h2 className="text-2xl md:text-3xl font-bold text-white">
                            Link <span className="text-yellow-500">Expired</span>
                        </h2>
                        <p className="text-gray-400">This verification link has expired. Please request a new one.</p>
                    </>
                )}
            </motion.div>

            {/* Email display for pending state */}
            {status === "pending" && email && (
                <motion.div variants={itemVariants}>
                    <p className="text-white font-medium text-base bg-white/5 py-3 px-4 rounded-xl border border-white/10 truncate">
                        {email}
                    </p>
                </motion.div>
            )}

            {/* Action Buttons */}
            <motion.div className="space-y-3 pt-4" variants={itemVariants}>
                {status === "pending" && (
                    <>
                        <Button
                            variant="neon"
                            className="w-full h-12 text-base"
                            onClick={onResend}
                            disabled={isResending || cooldown > 0}
                        >
                            {isResending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending...
                                </>
                            ) : cooldown > 0 ? (
                                `Resend in ${cooldown}s`
                            ) : (
                                "Resend Verification Email"
                            )}
                        </Button>

                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="flex-1 h-10"
                                onClick={onSignOut}
                            >
                                Sign Out
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1 h-10"
                                asChild
                            >
                                <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer">
                                    Open Gmail
                                </a>
                            </Button>
                        </div>
                    </>
                )}

                {status === "success" && (
                    <Button
                        variant="neon"
                        className="w-full h-12 text-base"
                        asChild
                    >
                        <Link href="/dashboard">Continue to Dashboard</Link>
                    </Button>
                )}

                {status === "error" && (
                    <Button
                        variant="neon"
                        className="w-full h-12 text-base"
                        asChild
                    >
                        <Link href="/login">Back to Login</Link>
                    </Button>
                )}

                {status === "expired" && (
                    <Button
                        variant="neon"
                        className="w-full h-12 text-base"
                        asChild
                    >
                        <Link href="/login">Back to Login</Link>
                    </Button>
                )}
            </motion.div>

            {/* Additional info text */}
            {status === "pending" && (
                <motion.p className="text-sm text-gray-500 pt-2" variants={itemVariants}>
                    Didn't receive the email? Check your spam folder or request a new one.
                </motion.p>
            )}
        </motion.div>
    );
}
