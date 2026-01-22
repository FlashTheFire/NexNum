
"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthLayout } from "@/components/layouts/AuthLayout"
import { Icons } from "@/components/ui/icons"

export default function ForgotPasswordPage() {
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState("")
    const [sent, setSent] = useState(false)

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })

            if (res.ok) {
                setSent(true)
                toast.success("Reset link sent!")
            } else {
                const data = await res.json()
                toast.error(data.error || "Failed to send reset link")
            }
        } catch (error) {
            toast.error("Network error")
        } finally {
            setLoading(false)
        }
    }

    if (sent) {
        return (
            <AuthLayout title="Check your inbox" description={`We sent a reset link to ${email}`}>
                <div className="text-center">
                    <Button variant="outline" className="w-full" asChild>
                        <Link href="/auth/login">Back to Login</Link>
                    </Button>
                </div>
            </AuthLayout>
        )
    }

    return (
        <AuthLayout
            title="Reset Password"
            description="Enter your email to receive a password reset link"
        >
            <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Input
                        placeholder="Email address"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-secondary/20 border-white/10 text-white placeholder:text-muted-foreground"
                    />
                </div>

                <Button type="submit" className="w-full" disabled={loading} variant="neon">
                    {loading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                    Send Reset Link
                </Button>

                <div className="text-center text-sm">
                    <Link href="/auth/login" className="text-muted-foreground hover:text-white transition-colors">
                        Back to Login
                    </Link>
                </div>
            </form>
        </AuthLayout>
    )
}
