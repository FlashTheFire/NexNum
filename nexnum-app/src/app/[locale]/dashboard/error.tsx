'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardBackground } from './components/dashboard-background'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log to Sentry
        console.error('Dashboard Error:', error)
    }, [error])

    return (
        <div className="min-h-screen relative flex items-center justify-center p-4">
            <DashboardBackground />

            <div className="relative z-10 max-w-md w-full bg-[#0c0e12]/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                    <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">Something went wrong!</h2>
                <p className="text-gray-400 mb-8 leading-relaxed">
                    We encountered an unexpected error while loading your dashboard.
                    Our team has been notified.
                </p>

                <div className="flex flex-col gap-3">
                    <Button
                        onClick={reset}
                        className="w-full h-12 bg-white text-black hover:bg-gray-200 font-bold rounded-xl"
                    >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Try again
                    </Button>

                    <Button
                        variant="ghost"
                        onClick={() => window.location.href = '/'}
                        className="w-full h-12 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl"
                    >
                        <Home className="mr-2 h-4 w-4" />
                        Return Home
                    </Button>
                </div>

                {error.digest && (
                    <p className="mt-6 text-xs text-gray-600 font-mono">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>
        </div>
    )
}
