
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
import { AuthLayout } from "@/components/layouts/AuthLayout"
import { register } from "@/lib/api/auth-api"
import { Icons } from "@/components/ui/icons"

const registerSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    captchaToken: z.string().min(1, "Please verify you are human"),
})

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const form = useForm<RegisterForm>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            name: "",
            email: "",
            password: "",
            captchaToken: "",
        },
    })

    async function onRegister(data: RegisterForm) {
        setLoading(true)
        try {
            await register(data)
            toast.success("Account created successfully!")
            router.push("/dashboard")
        } catch (error: any) {
            toast.error(error.message)
            form.setValue("captchaToken", "")
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthLayout
            title="Create Account"
            description="Join thousands of users getting instant virtual numbers"
        >
            <form onSubmit={form.handleSubmit(onRegister)} className="space-y-4">
                <div className="space-y-2">
                    <Input
                        placeholder="Full Name"
                        {...form.register("name")}
                        className="bg-secondary/20 border-white/10 text-white placeholder:text-muted-foreground"
                    />
                    {form.formState.errors.name && (
                        <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                    )}
                </div>

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
                    Create Account
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link href="/auth/login" className="text-neon-lime hover:underline">
                        Sign In
                    </Link>
                </div>
            </form>
        </AuthLayout>
    )
}
