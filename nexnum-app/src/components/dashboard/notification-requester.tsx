"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}

export function NotificationRequester() {
    const hasRequested = useRef(false)
    const [showModal, setShowModal] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const [isSubscribing, setIsSubscribing] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const checkMobile = () => setIsMobile(window.innerWidth < 640)
        checkMobile()
        window.addEventListener('resize', checkMobile)

        if (hasRequested.current) return
        hasRequested.current = true

        if (!("Notification" in window)) return

        // Check if already granted but maybe not subscribed (optional robustness)
        if (Notification.permission === "default") {
            setTimeout(() => {
                setShowModal(true)
            }, 1000)
        }

        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    const subscribeToPush = async () => {
        setIsSubscribing(true)
        try {
            // 1. Register Service Worker
            if (!('serviceWorker' in navigator)) throw new Error('No Service Worker support')
            const registration = await navigator.serviceWorker.register('/sw.js')
            await navigator.serviceWorker.ready

            // 2. Subscribe to PushManager
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

            if (!vapidKey) {
                console.error('VAPID Public Key not found in environment variables.')
                toast.error("Configuration Error", {
                    description: "Missing VAPID Key. Please restart the server."
                })
                return
            }

            const convertedVapidKey = urlBase64ToUint8Array(vapidKey)

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            })

            // 3. Send to Server
            const response = await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            })

            if (!response.ok) throw new Error('Failed to save subscription')

            toast.success("Notifications Enabled", {
                description: "You will receive alerts even when closed.",
                icon: <CheckCircle2 className="h-4 w-4 text-[hsl(var(--neon-lime))]" />
            })

        } catch (error) {
            console.error('Push subscription failed:', error)
            toast.error("Setup Failed", {
                description: "Could not enable background notifications."
            })
        } finally {
            setIsSubscribing(false)
        }
    }

    const handleAllow = async () => {
        if (navigator.vibrate) navigator.vibrate(50)

        try {
            // Native Permission Request
            const permission = await Notification.requestPermission()

            if (permission === 'granted') {
                setShowModal(false)
                // Proceed to Background Subscription
                await subscribeToPush()
            }
        } catch (err) {
            console.error(err)
            setShowModal(false)
        }
    }

    const handleDismiss = () => {
        setShowModal(false)
    }

    // Only mount on client
    if (!mounted) return null

    // If permission is already granted, don't show (unless manually triggered? logic above handles manually setting showModal=true, 
    // but we might want to prevent rendering if granted? 
    // Actually, if user manually requests it (e.g. to re-subscribe or debug), we should probably allow it even if "granted" state is confusing. 
    // But realistically, if granted, we shouldn't show this specific "Allow" modal. 
    // However, for the "Setup Failed" case, it might be valuable.
    // Let's stick to showing it if showModal is true.

    return (
        <AnimatePresence>
            {showModal && (
                <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-0">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleDismiss}
                        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
                    />

                    {/* Desktop: High-End Premium Card */}
                    {!isMobile && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.4, type: "spring", bounce: 0.3 }}
                            className="relative w-full max-w-[340px] rounded-[32px] overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,1)]"
                        >
                            {/* Card Background with subtle top-down light gradient */}
                            <div className="absolute inset-0 bg-gradient-to-b from-[#18181a] to-[#0A0A0C]" />
                            {/* Noise Texture Overlay */}
                            <div className="absolute inset-0 opacity-[0.03] bg-[url('/noise.png')] pointer-events-none" />
                            {/* Glass Highlight Top */}
                            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                            <div className="relative p-6 pt-8 flex flex-col items-center text-center">
                                {/* Premium Icon Container */}
                                <div className="mb-6 relative group">
                                    <div className="absolute inset-0 bg-[hsl(var(--neon-lime))] blur-[50px] opacity-10 rounded-full group-hover:opacity-20 transition-opacity duration-700" />

                                    <div className="h-16 w-16 rounded-[20px] bg-gradient-to-br from-[#222] to-[#111] flex items-center justify-center relative border-t border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                                        <Image
                                            src="/logos/nexnum-logo.svg"
                                            alt="NexNum"
                                            width={32}
                                            height={32}
                                            className="w-8 h-8 opacity-90"
                                        />
                                        {/* Status Dot */}
                                        <div className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-[#0A0A0C] rounded-full flex items-center justify-center">
                                            <span className="relative flex h-2.5 w-2.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--neon-lime))]"></span>
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <h2 className="text-[20px] font-bold text-white mb-2 tracking-tight">
                                    Enable Notifications
                                </h2>
                                <p className="text-white/40 text-[14px] leading-relaxed mb-7 px-2 font-medium">
                                    Instant alerts for your verification codes.
                                </p>

                                <div className="w-full space-y-3">
                                    <button
                                        onClick={handleAllow}
                                        disabled={isSubscribing}
                                        className="relative w-full h-[50px] rounded-[18px] bg-[hsl(var(--neon-lime))] text-black text-[15px] font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_20px_-5px_hsl(var(--neon-lime))/0.4] flex items-center justify-center overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        <span className="relative z-10">{isSubscribing ? 'Enabling...' : 'Allow'}</span>
                                        {/* Premium sheen */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent pointer-events-none" />
                                    </button>

                                    <button
                                        onClick={handleDismiss}
                                        className="w-full h-[50px] rounded-[18px] bg-white/5 hover:bg-white/10 text-white/60 hover:text-white active:scale-[0.98] transition-all text-[14px] font-medium"
                                    >
                                        Later
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Mobile: Ultra-Premium Bottom Sheet */}
                    {isMobile && (
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 320 }}
                            className="relative w-full"
                        >
                            {/* Main Sheet Container - Deep Black with gradient border trick */}
                            <div className="relative rounded-[32px] overflow-hidden">
                                {/* Gradient Border Mockup */}
                                <div className="absolute inset-0 rounded-[32px] p-[1px] bg-gradient-to-b from-white/10 to-transparent">
                                    <div className="absolute inset-0 rounded-[32px] bg-[#0f0f11]" />
                                </div>

                                {/* Content Wrapper */}
                                <div className="relative bg-[#0f0f11] rounded-[32px] overflow-hidden">
                                    {/* Top Pull Indicator */}
                                    <div className="absolute top-3 inset-x-0 flex justify-center">
                                        <div className="w-8 h-1 bg-white/10 rounded-full" />
                                    </div>

                                    <div className="p-6 pt-8">
                                        {/* Header */}
                                        <div className="flex items-center justify-between mb-8">
                                            <div>
                                                <h2 className="text-[20px] font-bold text-white leading-tight mb-1">
                                                    Stay Updated
                                                </h2>
                                                <p className="text-white/40 text-[14px] font-medium">
                                                    Don't miss a code
                                                </p>
                                            </div>

                                            <button
                                                onClick={handleDismiss}
                                                className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all active:scale-95"
                                            >
                                                <X className="h-4 w-4 text-white/50" />
                                            </button>
                                        </div>

                                        {/* Glassy Feature Card */}
                                        <div className="group bg-gradient-to-br from-[#1A1A1C] to-[#121214] rounded-[22px] p-4 flex items-center gap-4 border-t border-white/5 border-b border-black/50 mb-8 relative shadow-lg">

                                            {/* Glowing Icon Square */}
                                            <div className="relative h-12 w-12 rounded-[14px] bg-[#0A0A0C] border border-white/5 flex items-center justify-center shrink-0 shadow-inner">
                                                <div className="absolute inset-0 bg-[hsl(var(--neon-lime))] opacity-5 blur-md" />
                                                <Image
                                                    src="/logos/nexnum-logo.svg"
                                                    alt="NexNum"
                                                    width={22}
                                                    height={22}
                                                    className="w-[22px] h-[22px] opacity-90"
                                                />
                                            </div>

                                            <div className="relative">
                                                <div className="text-[15px] font-bold text-white/90 mb-0.5">Instant Alerts</div>
                                                <div className="text-[13px] text-white/40">Real-time SMS delivery detection</div>
                                            </div>
                                        </div>

                                        {/* Solid CTA Button */}
                                        <button
                                            onClick={handleAllow}
                                            disabled={isSubscribing}
                                            className="w-full h-[54px] rounded-[20px] bg-[hsl(var(--neon-lime))] text-black text-[16px] font-bold active:scale-[0.97] transition-all shadow-[0_8px_20px_-6px_hsl(var(--neon-lime))/0.4] flex items-center justify-center gap-2 group relative overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            <span className="relative z-10">{isSubscribing ? 'Enabling...' : 'Allow Notifications'}</span>
                                            {/* Button Gradient Overlay for Depth */}
                                            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            )}
        </AnimatePresence>
    )
}
