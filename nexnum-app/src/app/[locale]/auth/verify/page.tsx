"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import VerifyEmailBackground from "@/components/auth/VerifyEmailBackground"
import VerifyEmailCard from "@/components/auth/VerifyEmailCard"
import VerifyEmailStatus from "@/components/auth/VerifyEmailStatus"

type VerificationStatus = 'idle' | 'loading' | 'success' | 'error' | 'expired' | 'pending'

function VerifyContent() {
    const { user, logout, checkAuth, isLoading: isAuthLoading } = useAuthStore()
    const searchParams = useSearchParams()
    const router = useRouter()
    const token = searchParams.get('token')

    const [status, setStatus] = useState<VerificationStatus>(token ? 'loading' : 'idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [resending, setResending] = useState(false)
    const [cooldown, setCooldown] = useState(0)
    const [pollIntervalId, setPollIntervalId] = useState<NodeJS.Timeout | null>(null)

    // Handle verification if token is present
    useEffect(() => {
        if (!token) return

        async function verify() {
            try {
                const res = await fetch('/api/auth/verify-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                    signal: AbortSignal.timeout(10000) // 10 second timeout
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
                    } else if (data.error?.includes('Invalid')) {
                        setStatus('error')
                        setErrorMessage('This verification link is invalid or has already been used.')
                    } else {
                        setStatus('error')
                    }
                    setErrorMessage(data.error || 'Verification failed')
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    setStatus('error')
                    setErrorMessage('Request timeout. Please check your connection and try again.')
                } else {
                    setStatus('error')
                    setErrorMessage('Network error. Please check your connection and try again.')
                }
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

        setStatus('pending')

        // POLLING: Check verification status with exponential backoff
        let attemptCount = 0
        const maxAttempts = 48 // Stop after ~5-10 minutes of polling
        let currentInterval = 5000 // Start at 5 seconds
        const maxInterval = 60000 // Cap at 60 seconds

        const startPolling = () => {
            const scheduleNextPoll = () => {
                if (attemptCount >= maxAttempts) {
                    // Stop polling after max attempts
                    return
                }

                const timeoutId = setTimeout(() => {
                    attemptCount++
                    
                    if (user && !user.emailVerified && attemptCount <= maxAttempts) {
                        checkAuth()
                        
                        // Exponential backoff: increase interval on each attempt
                        currentInterval = Math.min(currentInterval * 1.1, maxInterval)
                        scheduleNextPoll()
                    }
                }, currentInterval)

                setPollIntervalId(timeoutId as any)
            }

            scheduleNextPoll()
            return () => {
                if (pollIntervalId) clearTimeout(pollIntervalId as any)
            }
        }

        return startPolling()
    }, [user, isAuthLoading, token, router, checkAuth, pollIntervalId])

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalId) {
                clearInterval(pollIntervalId)
            }
        }
    }, [pollIntervalId])

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
                toast.success('Verification email sent! Check your inbox.')
                setCooldown(60)
            } else if (res.error?.includes('already verified')) {
                toast.info('Your email is already verified!')
                router.push('/dashboard')
            } else if (res.error?.includes('not found')) {
                toast.error('User account not found. Please sign in again.')
                router.push('/login')
            } else {
                toast.error(res.error || 'Failed to send email. Please try again.')
            }
        } catch (error: any) {
            if (error.message?.includes('timeout')) {
                toast.error('Request timeout. Please check your connection.')
            } else {
                toast.error('Network error. Please check your connection and try again.')
            }
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
            <div className="relative z-20 flex items-center justify-center min-h-screen">
                <VerifyEmailCard>
                    <div className="text-center space-y-4">
                        <Loader2 className="h-16 w-16 animate-spin text-[hsl(var(--neon-lime))] mx-auto" />
                        <p className="text-gray-400">Loading...</p>
                    </div>
                </VerifyEmailCard>
            </div>
        )
    }

    // Render appropriate status
    const displayStatus = token ? status : (status === 'idle' ? 'pending' : status)

    return (
        <div className="relative z-20 flex items-center justify-center min-h-screen px-4">
            <VerifyEmailCard className="w-full max-w-md">
                <VerifyEmailStatus
                    status={displayStatus as any}
                    email={user?.email}
                    errorMessage={errorMessage}
                    onResend={handleResend}
                    onSignOut={handleSignOut}
                    isResending={resending}
                    cooldown={cooldown}
                />
            </VerifyEmailCard>
        </div>
    )
}

export default function VerifyPage() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--background))]">
            {/* Animated background */}
            <VerifyEmailBackground />

            {/* Content */}
            <div className="relative z-10">
                <Suspense
                    fallback={
                        <div className="relative z-20 flex items-center justify-center min-h-screen">
                            <VerifyEmailCard>
                                <div className="text-center space-y-4">
                                    <Loader2 className="h-16 w-16 animate-spin text-[hsl(var(--neon-lime))] mx-auto" />
                                    <p className="text-gray-400">Loading...</p>
                                </div>
                            </VerifyEmailCard>
                        </div>
                    }
                >
                    <VerifyContent />
                </Suspense>
            </div>
        </div>
    )
}
