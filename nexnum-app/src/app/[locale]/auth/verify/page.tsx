"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AuthLayout } from "@/components/layout/AuthLayout"
import { Icons } from "@/components/ui/icons"
import { Mail, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"

type VerificationStatus = 'idle' | 'loading' | 'success' | 'error' | 'expired'

function VerifyContent() {
    const { user, logout, checkAuth, isLoading: isAuthLoading } = useAuthStore()
    const searchParams = useSearchParams()
    const router = useRouter()
    const token = searchParams.get('token')

    const [status, setStatus] = useState<VerificationStatus>(token ? 'loading' : 'idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [resending, setResending] = useState(false)
    const [cooldown, setCooldown] = useState(0)

    // Handle verification if token is present
    useEffect(() => {
        if (!token) return

        async function verify() {
            try {
                const res = await fetch('/api/auth/verify-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                })

                const data = await res.json()

                if (res.ok && data.success) {
                    setStatus('success')
                    toast.success('Email verified successfully!')

                    // Force refresh auth state
                    await checkAuth(true)

                    // Redirect to dashboard after 3 seconds
                    setTimeout(() => router.push('/dashboard'), 3000)
                } else {
                    if (data.error?.includes('expired')) {
                        setStatus('expired')
                    } else {
                        setStatus('error')
                    }
                    setErrorMessage(data.error || 'Verification failed')
                }
            } catch (error) {
                setStatus('error')
                setErrorMessage('Network error. Please try again.')
            }
        }

        verify()
    }, [token, router, checkAuth])

    // Handle polling and redirect for "Pending Verification" state (no token)
    useEffect(() => {
        if (token || isAuthLoading || !user) return

        // Redirect to dashboard if already verified
        if (user.emailVerified) {
            router.replace('/dashboard')
            return
        }

        // POLLING: Check verification status every 5 seconds
        const pollInterval = setInterval(() => {
            if (user && !user.emailVerified) {
                checkAuth()
            }
        }, 5000)

        return () => clearInterval(pollInterval)
    }, [user, isAuthLoading, token, router, checkAuth])

    // Cooldown timer for resend
    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
            return () => clearTimeout(timer)
        }
    }, [cooldown])

    async function handleResend() {
        if (cooldown > 0) return
        setResending(true)

        try {
            const { api } = await import('@/lib/api/api-client')
            const res = await api.resendVerification()

            if (res.success) {
                toast.success('Verification email sent!')
                setCooldown(60)
            } else {
                toast.error(res.error || 'Failed to send email')
            }
        } catch (error) {
            toast.error('Network error')
        } finally {
            setResending(false)
        }
    }

    const handleSignOut = async () => {
        await logout()
        router.push('/login')
    }

    if (isAuthLoading && status === 'idle') {
        return (
            <div className="text-center space-y-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground">Loading...</p>
            </div>
        )
    }

    // Render "Verification Result" UI if token was used
    if (token) {
        switch (status) {
            case 'loading':
                return (
                    <div className="text-center space-y-4">
                        <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
                        <p className="text-muted-foreground">Verifying your email address...</p>
                    </div>
                )
            case 'success':
                return (
                    <div className="text-center space-y-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-24 w-24 rounded-full bg-green-500/20 animate-pulse" />
                            </div>
                            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto relative z-10" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Email Verified!</h2>
                            <p className="text-muted-foreground">Your email has been successfully verified. Redirecting...</p>
                        </div>
                        <Button variant="neon" className="w-full" asChild>
                            <Link href="/dashboard">Go to Dashboard</Link>
                        </Button>
                    </div>
                )
            case 'expired':
                return (
                    <div className="text-center space-y-6">
                        <XCircle className="h-16 w-16 text-yellow-500 mx-auto" />
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Link Expired</h2>
                            <p className="text-muted-foreground">This verification link has expired. Please request a new one.</p>
                        </div>
                        <Button variant="neon" className="w-full" asChild>
                            <Link href="/login">Back to Login</Link>
                        </Button>
                    </div>
                )
            case 'error':
                return (
                    <div className="text-center space-y-6">
                        <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Verification Failed</h2>
                            <p className="text-muted-foreground">{errorMessage || 'Unable to verify your email.'}</p>
                        </div>
                        <Button variant="neon" className="w-full" asChild>
                            <Link href="/login">Back to Login</Link>
                        </Button>
                    </div>
                )
        }
    }

    // Render "Pending Verification" UI if no token (and not verified)
    if (!user) {
        if (!isAuthLoading) router.replace('/login')
        return null
    }

    return (
        <div className="text-center space-y-6">
            <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                <div className="relative flex items-center justify-center w-24 h-24 bg-primary/10 rounded-full border border-primary/30">
                    <Mail className="h-10 w-10 text-primary" />
                </div>
            </div>

            <div className="space-y-3">
                <h2 className="text-xl font-semibold text-white">Check Your Inbox</h2>
                <p className="text-muted-foreground">We've sent a verification link to</p>
                <p className="text-white font-medium text-lg bg-white/5 py-2 px-4 rounded-lg border border-white/10">
                    {user.email}
                </p>
                <p className="text-sm text-muted-foreground">Click the link in the email to verify your account.</p>
            </div>

            <div className="space-y-3 pt-4">
                <Button
                    variant="neon"
                    className="w-full"
                    onClick={handleResend}
                    disabled={resending || cooldown > 0}
                >
                    {resending ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Verification Email'}
                </Button>

                <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleSignOut}>Sign Out</Button>
                    <Button variant="outline" className="flex-1" asChild>
                        <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer">Open Gmail</a>
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default function VerifyPage() {
    return (
        <AuthLayout title="" description="">
            <Suspense fallback={<div className="text-center"><Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" /></div>}>
                <VerifyContent />
            </Suspense>
        </AuthLayout>
    )
}
