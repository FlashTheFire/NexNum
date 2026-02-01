"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import HCaptcha from "@hcaptcha/react-hcaptcha"
import Script from "next/script"

interface CaptchaProps {
    onVerify: (token: string) => void
    onExpire?: () => void
    onError?: (error: string) => void
    className?: string
}

interface CaptchaConfig {
    enabled: boolean
    provider: 'hcaptcha' | 'recaptcha'
    siteKey: string
}

declare global {
    interface Window {
        grecaptcha: {
            ready: (callback: () => void) => void
            render: (container: string | HTMLElement, options: {
                sitekey: string
                callback: (token: string) => void
                theme?: string
                'expired-callback'?: () => void
                'error-callback'?: (error: string) => void
            }) => number
            reset: (widgetId?: number) => void
        }
        onRecaptchaLoad?: () => void
    }
}

/**
 * Dynamic Captcha Component
 * 
 * Fetches captcha configuration from admin settings and renders
 * either hCaptcha or Google reCAPTCHA based on the configuration.
 * If captcha is disabled, renders nothing but calls onVerify with empty string.
 */
export function Captcha({ onVerify, onExpire, onError, className }: CaptchaProps) {
    const [mounted, setMounted] = useState(false)
    const [config, setConfig] = useState<CaptchaConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [recaptchaReady, setRecaptchaReady] = useState(false)
    const hcaptchaRef = useRef<HCaptcha>(null)
    const recaptchaContainerRef = useRef<HTMLDivElement>(null)
    const recaptchaWidgetId = useRef<number | null>(null)

    // Fetch captcha config
    useEffect(() => {
        setMounted(true)

        async function fetchConfig() {
            try {
                const res = await fetch('/api/public/captcha-config')
                if (res.ok) {
                    const data = await res.json()
                    setConfig(data)

                    // If captcha is disabled, immediately "verify" with empty token
                    if (!data.enabled) {
                        onVerify('')
                    }
                }
            } catch (error) {
                console.error('Failed to fetch captcha config:', error)
                // Fallback to hCaptcha
                setConfig({
                    enabled: true,
                    provider: 'hcaptcha',
                    siteKey: process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY || '10000000-ffff-ffff-ffff-000000000001'
                })
            } finally {
                setLoading(false)
            }
        }

        fetchConfig()
    }, [onVerify])

    // Handle reCAPTCHA rendering
    const renderRecaptcha = useCallback(() => {
        if (
            config?.provider === 'recaptcha' &&
            config?.siteKey &&
            recaptchaContainerRef.current &&
            window.grecaptcha &&
            recaptchaWidgetId.current === null
        ) {
            try {
                recaptchaWidgetId.current = window.grecaptcha.render(recaptchaContainerRef.current, {
                    sitekey: config.siteKey,
                    callback: onVerify,
                    theme: 'dark',
                    'expired-callback': onExpire,
                    'error-callback': onError
                })
            } catch (e) {
                console.error('reCAPTCHA render error:', e)
            }
        }
    }, [config, onVerify, onExpire, onError])

    // Render reCAPTCHA when ready
    useEffect(() => {
        if (recaptchaReady && config?.provider === 'recaptcha') {
            renderRecaptcha()
        }
    }, [recaptchaReady, config, renderRecaptcha])

    // Handle reCAPTCHA script load
    const handleRecaptchaLoad = useCallback(() => {
        if (window.grecaptcha) {
            window.grecaptcha.ready(() => {
                setRecaptchaReady(true)
            })
        }
    }, [])

    // Loading state
    if (!mounted || loading) {
        return <div className="h-[78px] w-full bg-secondary/20 rounded animate-pulse" />
    }

    // If captcha is disabled, don't render anything
    if (!config?.enabled) {
        return null
    }

    // Render hCaptcha
    if (config.provider === 'hcaptcha') {
        return (
            <div className={`flex justify-center my-4 ${className || ''}`}>
                <HCaptcha
                    ref={hcaptchaRef}
                    sitekey={config.siteKey}
                    onVerify={onVerify}
                    onExpire={onExpire}
                    onError={onError}
                    theme="dark"
                />
            </div>
        )
    }

    // Render reCAPTCHA
    if (config.provider === 'recaptcha') {
        return (
            <>
                <Script
                    src="https://www.google.com/recaptcha/api.js?render=explicit"
                    onLoad={handleRecaptchaLoad}
                    strategy="lazyOnload"
                />
                <div className={`flex justify-center my-4 ${className || ''}`}>
                    <div ref={recaptchaContainerRef} className="g-recaptcha" />
                </div>
            </>
        )
    }

    return null
}

/**
 * Hook to check if captcha is required
 */
export function useCaptchaRequired() {
    const [required, setRequired] = useState(true)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function check() {
            try {
                const res = await fetch('/api/public/captcha-config')
                if (res.ok) {
                    const data = await res.json()
                    setRequired(data.enabled)
                }
            } catch {
                setRequired(true)
            } finally {
                setLoading(false)
            }
        }
        check()
    }, [])

    return { required, loading }
}
