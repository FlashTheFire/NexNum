'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import React from 'react'

interface SocialLoginButtonsProps {
    mode: 'login' | 'register'
}

interface EnabledProvider {
    id: string
    name: string
    enabled: boolean
}

// Provider SVG icons
const providerIcons: Record<string, React.ReactNode> = {
    google: (
        <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
    ),
    github: (
        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
    ),
    twitter: (
        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    ),
    discord: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#5865F2">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
    ),
    facebook: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#1877F2">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    ),
    telegram: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#0088cc">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
    ),
}

/**
 * Dynamic Social Login Buttons Component
 * 
 * Fetches enabled OAuth providers from admin settings and renders them dynamically.
 * Only shows enabled providers. Responsive design: shows name on desktop, icon only on mobile when space is tight.
 */
export function SocialLoginButtons({ mode }: SocialLoginButtonsProps) {
    const [loading, setLoading] = useState<string | null>(null)
    const [providers, setProviders] = useState<EnabledProvider[]>([])
    const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function fetchProviders() {
            try {
                const res = await fetch('/api/public/oauth-config')
                if (res.ok) {
                    const data = await res.json()
                    setProviders(data.providers || [])
                    setTelegramBotUsername(data.telegramBotUsername || null)
                }
            } catch (error) {
                console.error('Failed to fetch OAuth config:', error)
                // Default fallback
                setProviders([{ id: 'google', name: 'Google', enabled: true }])
            } finally {
                setIsLoading(false)
            }
        }
        fetchProviders()
    }, [])

    const handleAuth = (providerId: string) => {
        setLoading(providerId)

        if (providerId === 'telegram' && telegramBotUsername) {
            // Telegram uses Login Widget - open in new window
            const width = 550
            const height = 470
            const left = (window.innerWidth - width) / 2
            const top = (window.innerHeight - height) / 2
            window.open(
                `https://oauth.telegram.org/auth?bot_id=${telegramBotUsername}&origin=${window.location.origin}&request_access=write`,
                'Telegram Login',
                `width=${width},height=${height},left=${left},top=${top}`
            )
            setLoading(null)
            return
        }

        window.location.href = `/api/auth/${providerId}`
    }

    const text = mode === 'login' ? 'Sign in' : 'Sign up'

    // Don't render if no providers are enabled
    if (!isLoading && providers.length === 0) {
        return null
    }

    // Calculate grid columns based on number of providers
    const getGridClass = () => {
        const count = providers.length
        if (count === 1) return 'grid-cols-1'
        if (count === 2) return 'grid-cols-2'
        if (count === 3) return 'grid-cols-3'
        if (count <= 4) return 'grid-cols-2 sm:grid-cols-4'
        return 'grid-cols-3 sm:grid-cols-6' // 5-6 providers
    }

    // Show name only when there's enough space (1-4 providers)
    const showName = providers.length <= 4

    return (
        <div className="space-y-3">
            {/* Divider */}
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        Or continue with
                    </span>
                </div>
            </div>

            {/* Social Buttons */}
            {isLoading ? (
                <div className="flex justify-center py-4">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                </div>
            ) : (
                <div className={`grid gap-2 ${getGridClass()}`}>
                    {providers.map((provider) => (
                        <motion.button
                            key={provider.id}
                            type="button"
                            onClick={() => handleAuth(provider.id)}
                            disabled={loading !== null}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={provider.name}
                        >
                            {loading === provider.id ? (
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                            ) : (
                                providerIcons[provider.id] || null
                            )}
                            {/* Show name on larger screens or when few providers */}
                            {showName && (
                                <span className="hidden sm:inline">{provider.name}</span>
                            )}
                            {/* Always show name if only 1-2 providers */}
                            {providers.length <= 2 && (
                                <span className="sm:hidden">{provider.name}</span>
                            )}
                        </motion.button>
                    ))}
                </div>
            )}

            <p className="text-xs text-center text-muted-foreground">
                {text} with your social account for faster access
            </p>
        </div>
    )
}
