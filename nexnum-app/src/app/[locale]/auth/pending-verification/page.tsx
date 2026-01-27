"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AuthLayout } from "@/components/layout/AuthLayout"
import { Icons } from "@/components/ui/icons"
import { Mail, RefreshCw } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"

export default function PendingVerificationPage() {
    const { user, logout } = useAuthStore()
    const router = useRouter()
    const [resending, setResending] = useState(false)
    const [cooldown, setCooldown] = useState(0)

    useEffect(() => {
        // Redirect to landing if no user (requires login)
        if (!user) {
            router.replace('/')
            return
        }

        // Redirect to dashboard if already verified
        if (user.emailVerified) {
            router.replace('/dashboard')
            return
        }

        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
            return () => clearTimeout(timer)
        }
    }, [user, cooldown, router])

    async function handleResend() {
        if (cooldown > 0) return
        setResending(true)

        try {
            const res = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('nexnum_token')}`
                }
            })

            if (res.ok) {
                toast.success('Verification email sent!')
                setCooldown(60) // 60 second cooldown
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to send email')
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

    if (!user) return null // Prevent flash before redirect

    return (
        <AuthLayout
            title="Verify Your Email"
            description=""
        >
            <div className="text-center space-y-6">
                {/* Email Icon with Animation */}
                <div className="relative mx-auto w-24 h-24">
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                    <div className="relative flex items-center justify-center w-24 h-24 bg-primary/10 rounded-full border border-primary/30">
                        <Mail className="h-10 w-10 text-primary" />
                    </div>
                </div>

                <div className="space-y-3">
                    <h2 className="text-xl font-semibold text-white">Check Your Inbox</h2>
                    <p className="text-muted-foreground">
                        We've sent a verification link to
                    </p>
                    <p className="text-white font-medium text-lg bg-white/5 py-2 px-4 rounded-lg border border-white/10">
                        {user?.email || 'your email'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Click the link in the email to verify your account and unlock full access.
                    </p>
                </div>

                {/* Actions */}
                <div className="space-y-3 pt-4">
                    <Button
                        variant="neon"
                        className="w-full"
                        onClick={handleResend}
                        disabled={resending || cooldown > 0}
                    >
                        {resending ? (
                            <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Verification Email'}
                    </Button>

                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={handleSignOut}>
                            Sign Out
                        </Button>
                        <Button variant="outline" className="flex-1" asChild>
                            <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer">
                                Open Gmail
                            </a>
                        </Button>
                    </div>
                </div>

                {/* Tips */}
                <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-muted-foreground">
                        Didn't receive the email? Check your spam folder or try a different email address.
                    </p>
                </div>
            </div>
        </AuthLayout>
    )
}
