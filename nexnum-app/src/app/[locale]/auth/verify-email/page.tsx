"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AuthLayout } from "@/components/layout/AuthLayout"
import { Icons } from "@/components/ui/icons"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

type VerificationStatus = 'loading' | 'success' | 'error' | 'expired'

export default function VerifyEmailPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const token = searchParams.get('token')

    const [status, setStatus] = useState<VerificationStatus>('loading')
    const [errorMessage, setErrorMessage] = useState('')

    useEffect(() => {
        if (!token) {
            setStatus('error')
            setErrorMessage('No verification token provided')
            return
        }

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

                    // Refresh session to update emailVerified status
                    try {
                        const { useAuthStore } = await import('@/stores/authStore')
                        await useAuthStore.getState().checkAuth()
                    } catch (e) {
                        console.error('Failed to refresh session:', e)
                    }

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
    }, [token, router])

    const renderContent = () => {
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
                            <p className="text-muted-foreground">
                                Your email has been successfully verified. Redirecting to dashboard...
                            </p>
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
                            <p className="text-muted-foreground">
                                This verification link has expired. Please request a new one.
                            </p>
                        </div>
                        <Button variant="neon" className="w-full" asChild>
                            <Link href="/login">Back to Login</Link>
                        </Button>
                    </div>
                )

            case 'error':
            default:
                return (
                    <div className="text-center space-y-6">
                        <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                        <div className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Verification Failed</h2>
                            <p className="text-muted-foreground">
                                {errorMessage || 'Unable to verify your email. Please try again.'}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Button variant="neon" className="w-full" asChild>
                                <Link href="/login">Back to Login</Link>
                            </Button>
                            <Button variant="outline" className="w-full" asChild>
                                <Link href="/register">Create New Account</Link>
                            </Button>
                        </div>
                    </div>
                )
        }
    }

    return (
        <AuthLayout
            title={status === 'loading' ? 'Verifying Email' : ''}
            description=""
        >
            {renderContent()}
        </AuthLayout>
    )
}
