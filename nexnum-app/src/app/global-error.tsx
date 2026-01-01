"use client"

import * as Sentry from "@sentry/nextjs"
import Error from "next/error"
import { useEffect } from "react"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log the error to Sentry
        Sentry.captureException(error)
    }, [error])

    return (
        <html>
            <body>
                <div className="min-h-screen flex items-center justify-center bg-gray-900">
                    <div className="text-center p-8 max-w-md">
                        <div className="text-6xl mb-4">💥</div>
                        <h2 className="text-2xl font-bold text-white mb-4">
                            Something went wrong!
                        </h2>
                        <p className="text-gray-400 mb-6">
                            We've been notified and are working on it.
                        </p>
                        <button
                            onClick={reset}
                            className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </body>
        </html>
    )
}
