'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

// Note: This root-level global-error page cannot use next-intl hooks
// because it's outside the [locale] segment and has no i18n provider context.

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('Global Error:', error)
    }, [error])

    return (
        <html>
            <body className="bg-black text-white antialiased">
                <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="max-w-md w-full text-center space-y-6">
                        <div className="inline-flex p-4 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
                            <AlertTriangle className="h-10 w-10 text-red-500" />
                        </div>

                        <h1 className="text-3xl font-bold">Critical Error</h1>
                        <p className="text-gray-400">
                            Something went seriously wrong. Please reload the page.
                        </p>

                        <button
                            onClick={reset}
                            className="px-6 py-3 bg-[hsl(var(--neon-lime))] text-black font-bold rounded-xl hover:opacity-90 transition-opacity"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            </body>
        </html>
    )
}
