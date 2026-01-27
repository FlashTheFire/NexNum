"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthLayout } from "@/components/layout/AuthLayout"
import { Icons } from "@/components/ui/icons"
import { CheckCircle2, XCircle, Eye, EyeOff, Lock } from "lucide-react"

type ResetStatus = 'form' | 'loading' | 'success' | 'error' | 'invalid'

export default function ResetPasswordPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const token = searchParams.get('token')

    const [status, setStatus] = useState<ResetStatus>('form')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [errorMessage, setErrorMessage] = useState('')

    useEffect(() => {
        if (!token) {
            setStatus('invalid')
            setErrorMessage('No reset token provided. Please request a new password reset link.')
        }
    }, [token])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()

        // Validation
        if (password.length < 8) {
            toast.error('Password must be at least 8 characters')
            return
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match')
            return
        }

        setStatus('loading')

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password })
            })

            const data = await res.json()

            if (res.ok && data.success) {
                setStatus('success')
                toast.success('Password reset successfully!')
                setTimeout(() => router.push('/login'), 3000)
            } else {
                setStatus('error')
                setErrorMessage(data.error || 'Failed to reset password')
            }
        } catch (error) {
            setStatus('error')
            setErrorMessage('Network error. Please try again.')
        }
    }

    if (status === 'invalid') {
        return (
            <AuthLayout title="Invalid Reset Link" description="">
                <div className="text-center space-y-6">
                    <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                    <p className="text-muted-foreground">{errorMessage}</p>
                    <Button variant="neon" className="w-full" asChild>
                        <Link href="/forgot-password">Request New Link</Link>
                    </Button>
                </div>
            </AuthLayout>
        )
    }

    if (status === 'success') {
        return (
            <AuthLayout title="" description="">
                <div className="text-center space-y-6">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-24 w-24 rounded-full bg-green-500/20 animate-pulse" />
                        </div>
                        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto relative z-10" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Password Reset!</h2>
                        <p className="text-muted-foreground">
                            Your password has been successfully reset. Redirecting to login...
                        </p>
                    </div>
                    <Button variant="neon" className="w-full" asChild>
                        <Link href="/login">Go to Login</Link>
                    </Button>
                </div>
            </AuthLayout>
        )
    }

    if (status === 'error') {
        return (
            <AuthLayout title="Reset Failed" description="">
                <div className="text-center space-y-6">
                    <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                    <p className="text-muted-foreground">{errorMessage}</p>
                    <div className="space-y-2">
                        <Button variant="neon" className="w-full" asChild>
                            <Link href="/forgot-password">Try Again</Link>
                        </Button>
                        <Button variant="outline" className="w-full" asChild>
                            <Link href="/login">Back to Login</Link>
                        </Button>
                    </div>
                </div>
            </AuthLayout>
        )
    }

    return (
        <AuthLayout
            title="Set New Password"
            description="Create a strong password for your account"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="New password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            className="pl-10 bg-secondary/20 border-white/10 text-white placeholder:text-muted-foreground"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Confirm password"
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            className="pl-10 bg-secondary/20 border-white/10 text-white placeholder:text-muted-foreground"
                        />
                    </div>
                </div>

                {/* Password Requirements */}
                <div className="text-xs text-muted-foreground space-y-1">
                    <p className={password.length >= 8 ? "text-green-500" : ""}>
                        ✓ At least 8 characters
                    </p>
                    <p className={password === confirmPassword && password.length > 0 ? "text-green-500" : ""}>
                        ✓ Passwords match
                    </p>
                </div>

                <Button
                    type="submit"
                    className="w-full"
                    disabled={status === 'loading'}
                    variant="neon"
                >
                    {status === 'loading' && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                    Reset Password
                </Button>

                <div className="text-center text-sm">
                    <Link href="/login" className="text-muted-foreground hover:text-white transition-colors">
                        Back to Login
                    </Link>
                </div>
            </form>
        </AuthLayout>
    )
}
