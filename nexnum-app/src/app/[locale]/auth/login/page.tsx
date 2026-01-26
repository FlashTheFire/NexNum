
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Captcha } from "@/components/auth/Captcha"
import { AuthLayout } from "@/components/layout/AuthLayout"
import { login } from "@/lib/api/auth-api"
import { Icons } from "@/components/ui/icons"

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    captchaToken: z.string().min(1, "Please verify you are human"),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState<"LOGIN" | "2FA">("LOGIN")
    const [tempToken, setTempToken] = useState("")

    const form = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
            captchaToken: "",
        },
    })

    // 2FA Form State
    const [twoFaCode, setTwoFaCode] = useState("")

    async function onLogin(data: LoginForm) {
        setLoading(true)
        try {
            const res = await login(data)

            if (res.requires2Fa) {
                setTempToken(res.tempToken)
                setStep("2FA")
                toast.info("2FA Code Required")
            } else {
                toast.success("Welcome back!")
                router.push("/dashboard")
            }
        } catch (error: any) {
            toast.error(error.message)
            // Reset captcha on error
            form.setValue("captchaToken", "")
        } finally {
            setLoading(false)
        }
    }

    async function onVerify2FA(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch('/api/auth/2fa/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: twoFaCode, tempToken })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            toast.success("Verified successfully")
            router.push("/dashboard")
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout
            title={step === "LOGIN" ? "Welcome Back" : "Two-Factor Auth"}
            description={step === "LOGIN" ? "Enter your credentials to access your account" : "Enter the code from your authenticator app"}
        >
            {step === "LOGIN" ? (
                <form onSubmit={form.handleSubmit(onLogin)} className="space-y-4">
                    <div className="space-y-2">
                        <Input
                            placeholder="Email address"
                            type="email"
                            {...form.register("email")}
                            className="bg-secondary/20 border-white/10 text-white placeholder:text-muted-foreground"
                        />
                        {form.formState.errors.email && (
                            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Input
                            placeholder="Password"
                            type="password"
                            {...form.register("password")}
                            className="bg-secondary/20 border-white/10 text-white placeholder:text-muted-foreground"
                        />
                        {form.formState.errors.password && (
                            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                        )}
                    </div>

                    <Captcha onVerify={(token) => form.setValue("captchaToken", token)} />
                    {form.formState.errors.captchaToken && (
                        <p className="text-xs text-center text-destructive">{form.formState.errors.captchaToken.message}</p>
                    )}

                    <Button type="submit" className="w-full" disabled={loading} variant="neon">
                        {loading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                        Sign In
                    </Button>

                    <div className="text-center text-sm">
                        <Link href="/auth/forgot-password" className="text-muted-foreground hover:text-white transition-colors">
                            Forgot password?
                        </Link>
                    </div>
                    <div className="text-center text-sm text-muted-foreground">
                        Don&apos;t have an account?{" "}
                        <Link href="/auth/register" className="text-neon-lime hover:underline">
                            Sign Up
                        </Link>
                    </div>
                </form>
            ) : (
                <form onSubmit={onVerify2FA} className="space-y-4">
                    <div className="space-y-2">
                        <Input
                            placeholder="000000"
                            className="text-center text-2xl tracking-widest bg-secondary/20 border-white/10 text-white"
                            maxLength={6}
                            value={twoFaCode}
                            onChange={(e) => setTwoFaCode(e.target.value.replace(/[^0-9]/g, ''))}
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading || twoFaCode.length < 6} variant="neon">
                        {loading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                        Verify Code
                    </Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("LOGIN")}>
                        Back to Login
                    </Button>
                </form>
            )}
        </AuthLayout>
    )
}
