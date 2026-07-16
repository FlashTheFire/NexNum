"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
    ArrowRight,
    CheckCircle2,
    CircleAlert,
    ExternalLink,
    Inbox,
    LoaderCircle,
    LogOut,
    MailCheck,
    RefreshCw,
    ShieldCheck,
} from "lucide-react"

import Auth3DLaptop from "@/components/auth/Auth3DLaptop"
import AuthBackground from "@/components/auth/AuthBackground"
import AuthCard from "@/components/auth/AuthCard"
import Navbar from "@/components/layout/Navbar"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api/api-client"
import { useAuthStore } from "@/stores/authStore"

type VerificationStatus = "checking" | "awaiting" | "verified" | "expired" | "failed"

const statusCopy: Record<VerificationStatus, { eyebrow: string; title: string; description: string }> = {
    checking: {
        eyebrow: "VERIFYING IDENTITY",
        title: "Securing your account",
        description: "We are validating your secure verification link.",
    },
    awaiting: {
        eyebrow: "ONE LAST STEP",
        title: "Verify your email",
        description: "Confirm your inbox to unlock your NexNum workspace.",
    },
    verified: {
        eyebrow: "IDENTITY CONFIRMED",
        title: "You are verified",
        description: "Your account is ready. Redirecting you to your workspace.",
    },
    expired: {
        eyebrow: "LINK EXPIRED",
        title: "Request a fresh link",
        description: "For your security, verification links expire after 48 hours.",
    },
    failed: {
        eyebrow: "VERIFICATION PAUSED",
        title: "We could not verify this link",
        description: "The link may be invalid, already used, or temporarily unavailable.",
    },
}

function VerificationMark({ status }: { status: VerificationStatus }) {
    const iconClass = "relative z-10 h-8 w-8 sm:h-9 sm:w-9"

    return (
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
            <div className="absolute inset-0 rounded-[1.75rem] bg-[hsl(var(--neon-lime)/0.16)] blur-2xl" />
            <div className="absolute inset-0 rounded-[1.75rem] border border-[hsl(var(--neon-lime)/0.3)] bg-[linear-gradient(145deg,hsl(var(--neon-lime)/0.23),hsl(var(--teal-deep)/0.35))] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_35px_hsl(var(--neon-lime)/0.14)]" />
            {status === "checking" && <LoaderCircle className={`${iconClass} animate-spin text-[hsl(var(--neon-lime))]`} />}
            {status === "verified" && <CheckCircle2 className={`${iconClass} text-[hsl(var(--neon-lime))]`} />}
            {status === "expired" && <RefreshCw className={`${iconClass} text-amber-300`} />}
            {status === "failed" && <CircleAlert className={`${iconClass} text-red-300`} />}
            {status === "awaiting" && <MailCheck className={`${iconClass} text-[hsl(var(--neon-lime))]`} />}
        </div>
    )
}

export default function EmailVerificationFlow() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const token = searchParams.get("token")
    const { user, isLoading: isAuthLoading, checkAuth, logout } = useAuthStore()

    const [status, setStatus] = useState<VerificationStatus>(token ? "checking" : "awaiting")
    const [errorMessage, setErrorMessage] = useState("")
    const [isResending, setIsResending] = useState(false)
    const [cooldown, setCooldown] = useState(0)
    const processedToken = useRef<string | null>(null)
    const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const verifyToken = useCallback(async () => {
        if (!token || processedToken.current === token) return
        processedToken.current = token
        setStatus("checking")

        const response = await api.verifyEmail(token)

        if (response.success) {
            setStatus("verified")
            await checkAuth(true)
            redirectTimer.current = setTimeout(() => router.replace("/dashboard"), 2500)
            return
        }

        const message = response.error || "Unable to verify your email. Please try again."
        setErrorMessage(message)
        setStatus(/expired/i.test(message) ? "expired" : "failed")
    }, [checkAuth, router, token])

    useEffect(() => {
        void verifyToken()

        return () => {
            if (redirectTimer.current) clearTimeout(redirectTimer.current)
        }
    }, [verifyToken])

    useEffect(() => {
        if (token || isAuthLoading) return

        if (!user) {
            router.replace("/login")
            return
        }

        if (user.emailVerified) {
            router.replace("/dashboard")
            return
        }

        const poll = setInterval(() => void checkAuth(true), 5000)
        return () => clearInterval(poll)
    }, [checkAuth, isAuthLoading, router, token, user])

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    const handleResend = async () => {
        if (cooldown > 0 || isResending) return

        setIsResending(true)
        const response = await api.resendVerification()
        setIsResending(false)

        if (response.success) {
            setCooldown(60)
            return
        }

        setErrorMessage(response.error || "We could not send another email. Please try again.")
        setStatus("failed")
    }

    const handleSignOut = async () => {
        await logout()
        router.replace("/login")
    }

    const copy = statusCopy[status]
    const canResend = !token && !!user && !user.emailVerified
    const email = user?.email

    const actions = (() => {
        if (status === "checking") {
            return <div className="h-14 rounded-xl border border-white/[0.08] bg-white/[0.03] animate-pulse" />
        }

        if (status === "verified") {
            return (
                <Button className="h-14 w-full bg-[hsl(var(--neon-lime))] font-bold text-black hover:bg-[hsl(var(--neon-lime-soft))] neon-glow" asChild>
                    <Link href="/dashboard">Open workspace <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
            )
        }

        if (canResend) {
            return (
                <div className="space-y-3">
                    <Button
                        className="h-14 w-full bg-[hsl(var(--neon-lime))] font-bold text-black hover:bg-[hsl(var(--neon-lime-soft))] disabled:opacity-60 neon-glow"
                        disabled={isResending || cooldown > 0}
                        onClick={handleResend}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isResending ? "animate-spin" : ""}`} />
                        {isResending ? "Sending secure link…" : cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend verification link"}
                    </Button>
                    <div className="grid grid-cols-2 gap-3">
                        <Button className="h-11 border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/[0.08]" variant="outline" onClick={handleSignOut}>
                            <LogOut className="mr-2 h-4 w-4" /> Sign out
                        </Button>
                        <Button className="h-11 border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/[0.08]" variant="outline" asChild>
                            <a href="https://mail.google.com" rel="noreferrer" target="_blank"><Inbox className="mr-2 h-4 w-4" /> Open inbox</a>
                        </Button>
                    </div>
                </div>
            )
        }

        return (
            <div className="space-y-3">
                <Button className="h-14 w-full bg-[hsl(var(--neon-lime))] font-bold text-black hover:bg-[hsl(var(--neon-lime-soft))] neon-glow" asChild>
                    <Link href="/login">Sign in to request a new link <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Link href="/register" className="flex items-center justify-center gap-1 text-sm text-gray-400 transition-colors hover:text-[hsl(var(--neon-lime))]">
                    Create a different account <ExternalLink className="h-3.5 w-3.5" />
                </Link>
            </div>
        )
    })()

    return (
        <main className="min-h-screen overflow-hidden bg-[#08080a] text-white">
            <AuthBackground />
            <div className="relative z-10 min-h-screen">
                <Navbar hideLogin hideRegister />

                <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1600px] items-center px-4 py-8 sm:px-6 lg:min-h-[calc(100vh-4.5rem)] lg:px-12 lg:py-12">
                    <div className="grid w-full items-center gap-12 lg:grid-cols-[1.25fr_0.75fr] xl:gap-20">
                        <section className="relative hidden min-h-[540px] items-center justify-center lg:flex" aria-label="NexNum platform preview">
                            <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[hsl(var(--neon-lime)/0.22)] to-transparent" />
                            <div className="relative scale-[0.82] xl:scale-95"><Auth3DLaptop /></div>
                            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-5 rounded-full border border-white/[0.08] bg-black/20 px-5 py-3 text-xs text-gray-400 backdrop-blur-xl">
                                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[hsl(var(--neon-lime))]" /> Secure account activation</span>
                                <span className="h-4 w-px bg-white/10" />
                                <span>One-click confirmation</span>
                            </div>
                        </section>

                        <section className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-lg">
                            <div className="mb-6 flex items-center gap-3 lg:hidden">
                                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--neon-lime)/0.32)] bg-[hsl(var(--neon-lime)/0.12)] shadow-[0_0_24px_hsl(var(--neon-lime)/0.14)]">
                                    <Image src="/assets/brand/nexnum-logo.svg" alt="NexNum" width={28} height={28} className="brightness-0 invert" />
                                </div>
                                <div>
                                    <p className="font-bold leading-none">Nex<span className="text-[hsl(var(--neon-lime))]">Num</span></p>
                                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-gray-500">Virtual numbers</p>
                                </div>
                            </div>

                            <motion.div initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
                                <p className="mb-3 text-xs font-bold tracking-[0.22em] text-[hsl(var(--neon-lime))]">{copy.eyebrow}</p>
                                <h1 className="max-w-lg text-3xl font-bold tracking-tight text-white sm:text-4xl xl:text-5xl">{copy.title}</h1>
                                <p className="mt-3 max-w-md text-sm leading-6 text-gray-400 sm:text-base">{copy.description}</p>
                            </motion.div>

                            <div className="mt-7">
                                <AuthCard className="w-full">
                                    <div className="space-y-6">
                                        <VerificationMark status={status} />
                                        <div className="space-y-3 text-center">
                                            {email && status !== "verified" && (
                                                <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 font-medium text-white break-all">
                                                    {email}
                                                </div>
                                            )}
                                            {status === "awaiting" && <p className="text-sm leading-6 text-gray-400">Open the secure link we sent to your inbox. It is valid for 48 hours.</p>}
                                            {(status === "failed" || status === "expired") && errorMessage && <p className="text-sm leading-6 text-amber-200">{errorMessage}</p>}
                                        </div>

                                        {status === "awaiting" && (
                                            <div className="grid grid-cols-3 gap-2 border-y border-white/[0.07] py-4 text-center text-[11px] leading-4 text-gray-500">
                                                <span>1. Check your inbox</span><span>2. Open the link</span><span>3. Start verifying</span>
                                            </div>
                                        )}

                                        {actions}
                                    </div>
                                </AuthCard>
                            </div>

                            <p className="mt-5 text-center text-xs text-gray-500">Need help? Check spam or contact NexNum support.</p>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    )
}
