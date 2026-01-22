
"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface AuthLayoutProps {
    children: React.ReactNode
    title?: string
    description?: string
}

export function AuthLayout({ children, title, description }: AuthLayoutProps) {
    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] animate-pulse-soft" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-mid/20 rounded-full blur-[100px] animate-pulse-soft delay-1000" />
                <div className="film-grain absolute inset-0 opacity-20" />
            </div>

            <div className="relative z-10 w-full max-w-md p-4">
                <div className="glass-premium rounded-2xl p-8 border border-white/5 shadow-2xl backdrop-blur-xl">
                    <div className="flex flex-col space-y-2 text-center mb-6">
                        {title && <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>}
                        {description && <p className="text-sm text-muted-foreground">{description}</p>}
                    </div>
                    {children}
                </div>

                <div className="mt-8 text-center text-xs text-muted-foreground">
                    &copy; {new Date().getFullYear()} NexNum. Secure & Private.
                </div>
            </div>
        </div>
    )
}
