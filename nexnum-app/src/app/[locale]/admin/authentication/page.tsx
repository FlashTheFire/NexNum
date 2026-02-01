"use client"

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Shield, Key, Lock, Clock, Bot, Mail, AlertTriangle, Save,
    RefreshCw, Check, Eye, EyeOff, Globe, Smartphone, Users,
    Settings, Activity, Zap, ChevronRight, ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'

// Types
interface AuthSettings {
    oauth: {
        google: { enabled: boolean; clientId: string }
        github: { enabled: boolean; clientId: string }
    }
    twoFactor: {
        required: 'all' | 'admin' | 'optional'
        backupCodesCount: number
    }
    password: {
        minLength: number
        requireUppercase: boolean
        requireNumber: boolean
        requireSpecial: boolean
    }
    session: {
        tokenExpiryDays: number
        maxConcurrentSessions: number
    }
    captcha: {
        enabled: boolean
        provider: 'hcaptcha' | 'recaptcha'
    }
    email: {
        verificationRequired: boolean
        verificationExpiryHours: number
    }
    disposableEmail: {
        enabled: boolean
        blockPublicProviders: boolean
    }
    rateLimit: {
        authAttemptsPerMinute: number
        lockoutDurationMinutes: number
    }
}

const defaultSettings: AuthSettings = {
    oauth: {
        google: { enabled: true, clientId: '' },
        github: { enabled: false, clientId: '' }
    },
    twoFactor: {
        required: 'optional',
        backupCodesCount: 10
    },
    password: {
        minLength: 8,
        requireUppercase: true,
        requireNumber: true,
        requireSpecial: false
    },
    session: {
        tokenExpiryDays: 7,
        maxConcurrentSessions: 5
    },
    captcha: {
        enabled: true,
        provider: 'hcaptcha'
    },
    email: {
        verificationRequired: true,
        verificationExpiryHours: 24
    },
    disposableEmail: {
        enabled: true,
        blockPublicProviders: false
    },
    rateLimit: {
        authAttemptsPerMinute: 5,
        lockoutDurationMinutes: 15
    }
}

type TabType = 'oauth' | 'twoFactor' | 'password' | 'session' | 'captcha' | 'email' | 'security'

const tabs = [
    { id: 'oauth' as TabType, label: 'OAuth Providers', icon: Globe, color: 'text-emerald-400', glow: 'emerald' },
    { id: 'twoFactor' as TabType, label: 'Two-Factor Auth', icon: Smartphone, color: 'text-cyan-400', glow: 'cyan' },
    { id: 'password' as TabType, label: 'Password Policy', icon: Key, color: 'text-purple-400', glow: 'purple' },
    { id: 'session' as TabType, label: 'Sessions', icon: Clock, color: 'text-amber-400', glow: 'amber' },
    { id: 'captcha' as TabType, label: 'Captcha', icon: Bot, color: 'text-blue-400', glow: 'blue' },
    { id: 'email' as TabType, label: 'Email Security', icon: Mail, color: 'text-rose-400', glow: 'rose' },
    { id: 'security' as TabType, label: 'Rate Limiting', icon: Shield, color: 'text-indigo-400', glow: 'indigo' },
]

// ============================================
// PREMIUM UI COMPONENTS (matching Monitoring page)
// ============================================

const PremiumCard = ({ children, className = "", glowColor = "emerald" }: { children: React.ReactNode, className?: string, glowColor?: string }) => {
    const glows: Record<string, string> = {
        emerald: "from-emerald-500/10 to-transparent",
        cyan: "from-cyan-500/10 to-transparent",
        purple: "from-purple-500/10 to-transparent",
        amber: "from-amber-500/10 to-transparent",
        blue: "from-blue-500/10 to-transparent",
        rose: "from-rose-500/10 to-transparent",
        indigo: "from-indigo-500/10 to-transparent",
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0F1115] p-5 md:p-6 shadow-2xl ${className}`}
        >
            {/* Top Light Accent */}
            <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r ${glows[glowColor] || glows.emerald} via-white/20 to-transparent opacity-50`} />

            {/* Background Gradient */}
            <div className={`absolute -top-20 -right-20 w-40 h-40 bg-${glowColor}-500/20 blur-[60px] rounded-full pointer-events-none`} />

            {/* Content */}
            <div className="relative z-10">
                {children}
            </div>
        </motion.div>
    )
}

const CardHeader = ({ title, icon: Icon, color = "text-emerald-400", description }: { title: string, icon: any, color?: string, description?: string }) => (
    <div className="flex items-start gap-3 mb-5">
        <div className={`p-2 rounded-xl bg-white/5 border border-white/5 ${color}`}>
            <Icon size={18} />
        </div>
        <div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {description && <p className="text-xs text-white/40 mt-0.5">{description}</p>}
        </div>
    </div>
)

// Input Component
function SettingsInput({
    label, value, onChange, type = 'text', hint, suffix, disabled, icon: Icon
}: {
    label: string
    value: string | number
    onChange: (value: string) => void
    type?: 'text' | 'number' | 'password'
    hint?: string
    suffix?: string
    disabled?: boolean
    icon?: any
}) {
    const [showPassword, setShowPassword] = useState(false)

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-white/70">{label}</label>
            <div className="relative">
                {Icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                        <Icon size={16} />
                    </div>
                )}
                <input
                    type={type === 'password' ? (showPassword ? 'text' : 'password') : type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className={`w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${Icon ? 'pl-10' : ''}`}
                />
                {type === 'password' && (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                )}
                {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">
                        {suffix}
                    </span>
                )}
            </div>
            {hint && <p className="text-xs text-white/30">{hint}</p>}
        </div>
    )
}

// Toggle Component - Premium style
function SettingsToggle({
    label, enabled, onChange, description
}: {
    label: string
    enabled: boolean
    onChange: (enabled: boolean) => void
    description?: string
}) {
    return (
        <div
            onClick={() => onChange(!enabled)}
            className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:bg-white/[0.07] transition-all group"
        >
            <div>
                <span className="text-sm font-medium text-white group-hover:text-emerald-300 transition-colors">{label}</span>
                {description && <p className="text-xs text-white/40 mt-1">{description}</p>}
            </div>
            <button
                className={`relative w-12 h-6 rounded-full transition-all duration-300 ${enabled ? 'bg-emerald-500' : 'bg-white/20'}`}
            >
                <motion.div
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-lg"
                    animate={{ left: enabled ? '1.75rem' : '0.25rem' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
            </button>
        </div>
    )
}

// Select Component
function SettingsSelect({
    label, value, options, onChange, description
}: {
    label: string
    value: string
    options: { value: string; label: string }[]
    onChange: (value: string) => void
    description?: string
}) {
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-white/70">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value} className="bg-[#0F1115]">{opt.label}</option>
                ))}
            </select>
            {description && <p className="text-xs text-white/30">{description}</p>}
        </div>
    )
}

// OAuth Provider Card
function OAuthProviderCard({
    name, icon, enabled, clientId, onToggle, onClientIdChange
}: {
    name: string
    icon: React.ReactNode
    enabled: boolean
    clientId: string
    onToggle: () => void
    onClientIdChange: (value: string) => void
}) {
    return (
        <div className={`p-5 bg-white/5 rounded-xl border transition-all ${enabled ? 'border-emerald-500/30' : 'border-white/10'}`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        {icon}
                    </div>
                    <div>
                        <h4 className="font-medium text-white">{name}</h4>
                        <p className="text-xs text-white/40">Single Sign-On Provider</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {enabled && clientId && (
                        <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
                            CONFIGURED
                        </span>
                    )}
                    <button
                        onClick={onToggle}
                        className={`relative w-12 h-6 rounded-full transition-all duration-300 ${enabled ? 'bg-emerald-500' : 'bg-white/20'}`}
                    >
                        <motion.div
                            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-lg"
                            animate={{ left: enabled ? '1.75rem' : '0.25rem' }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                    </button>
                </div>
            </div>
            {enabled && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-4 border-t border-white/10"
                >
                    <SettingsInput
                        label="Client ID"
                        value={clientId}
                        onChange={onClientIdChange}
                        hint="From developer console"
                        icon={Key}
                    />
                </motion.div>
            )}
        </div>
    )
}

export default function AuthenticationSettingsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('oauth')
    const [settings, setSettings] = useState<AuthSettings>(defaultSettings)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [csrfToken, setCsrfToken] = useState<string>('')

    useEffect(() => {
        fetchSettings()
        fetchCsrf()
    }, [])

    async function fetchCsrf() {
        try {
            const res = await fetch('/api/csrf')
            const data = await res.json()
            if (data.success) {
                setCsrfToken(data.token)
            }
        } catch (e) {
            console.error('Failed to fetch CSRF token')
        }
    }

    async function fetchSettings() {
        try {
            const res = await fetch('/api/admin/auth-settings')
            if (res.ok) {
                const data = await res.json()
                if (data.data) {
                    setSettings(data.data)
                }
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error)
        } finally {
            setLoading(false)
        }
    }

    async function saveSettings() {
        setSaving(true)
        try {
            const res = await fetch('/api/admin/auth-settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken
                },
                body: JSON.stringify(settings)
            })
            if (res.ok) {
                toast.success('Settings saved successfully')
                setHasChanges(false)
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to save settings')
            }
        } catch (error) {
            toast.error('Network error')
        } finally {
            setSaving(false)
        }
    }

    function updateSettings<K extends keyof AuthSettings>(
        section: K,
        key: keyof AuthSettings[K],
        value: any
    ) {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [key]: value
            }
        }))
        setHasChanges(true)
    }

    function updateNestedSettings<K extends keyof AuthSettings>(
        section: K,
        provider: string,
        key: string,
        value: any
    ) {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [provider]: {
                    ...(prev[section] as any)[provider],
                    [key]: value
                }
            }
        }))
        setHasChanges(true)
    }

    const activeTabConfig = tabs.find(t => t.id === activeTab)

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
                    <p className="text-white/40">Loading authentication settings...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0a0a0c] p-4 md:p-6 lg:p-8 font-sans">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Shield className="text-emerald-400 w-6 h-6 md:w-7 md:h-7" strokeWidth={2.5} />
                        Authentication Settings
                    </h1>
                    <p className="text-white/40 mt-1 pl-1 text-sm md:text-base">
                        Configure security policies and login providers
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`px-3 py-1.5 rounded-full border flex items-center gap-2 ${hasChanges
                        ? 'bg-amber-500/10 border-amber-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20'
                        }`}>
                        <span className="relative flex h-2 w-2">
                            {hasChanges && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${hasChanges ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                        </span>
                        <span className={`text-[10px] font-bold tracking-wider ${hasChanges ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {hasChanges ? 'UNSAVED CHANGES' : 'ALL SAVED'}
                        </span>
                    </div>
                    <button
                        onClick={saveSettings}
                        disabled={!hasChanges || saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/10 disabled:text-white/30 rounded-xl text-white text-sm font-medium transition-all shadow-lg shadow-emerald-500/20 disabled:shadow-none"
                    >
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar - Tabs */}
                <div className="lg:w-64 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-hide">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap group ${activeTab === tab.id
                                ? 'bg-white/10 text-white border border-white/10'
                                : 'text-white/50 hover:bg-white/5 hover:text-white/80 border border-transparent'
                                }`}
                        >
                            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? tab.color : ''}`} />
                            <span className="font-medium">{tab.label}</span>
                            {activeTab === tab.id && (
                                <ChevronRight className="w-4 h-4 ml-auto text-white/30" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1">
                    <PremiumCard glowColor={activeTabConfig?.glow || 'emerald'}>
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-6"
                        >
                            {activeTab === 'oauth' && (
                                <>
                                    <CardHeader
                                        title="OAuth Providers"
                                        icon={Globe}
                                        color="text-emerald-400"
                                        description="Configure single sign-on authentication providers"
                                    />
                                    <div className="space-y-4">
                                        <OAuthProviderCard
                                            name="Google OAuth"
                                            icon={
                                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                            }
                                            enabled={settings.oauth.google.enabled}
                                            clientId={settings.oauth.google.clientId}
                                            onToggle={() => updateNestedSettings('oauth', 'google', 'enabled', !settings.oauth.google.enabled)}
                                            onClientIdChange={(v) => updateNestedSettings('oauth', 'google', 'clientId', v)}
                                        />

                                        <OAuthProviderCard
                                            name="GitHub OAuth"
                                            icon={
                                                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                                </svg>
                                            }
                                            enabled={settings.oauth.github.enabled}
                                            clientId={settings.oauth.github.clientId}
                                            onToggle={() => updateNestedSettings('oauth', 'github', 'enabled', !settings.oauth.github.enabled)}
                                            onClientIdChange={(v) => updateNestedSettings('oauth', 'github', 'clientId', v)}
                                        />
                                    </div>
                                </>
                            )}

                            {activeTab === 'twoFactor' && (
                                <>
                                    <CardHeader
                                        title="Two-Factor Authentication"
                                        icon={Smartphone}
                                        color="text-cyan-400"
                                        description="Configure 2FA requirements for users"
                                    />
                                    <div className="space-y-4">
                                        <SettingsSelect
                                            label="2FA Requirement"
                                            value={settings.twoFactor.required}
                                            options={[
                                                { value: 'optional', label: 'Optional - Users can choose' },
                                                { value: 'admin', label: 'Required for Admins only' },
                                                { value: 'all', label: 'Required for All Users' }
                                            ]}
                                            onChange={(v) => updateSettings('twoFactor', 'required', v)}
                                            description="Control who must enable 2FA"
                                        />
                                        <SettingsInput
                                            label="Backup Codes Count"
                                            type="number"
                                            value={settings.twoFactor.backupCodesCount}
                                            onChange={(v) => updateSettings('twoFactor', 'backupCodesCount', parseInt(v) || 10)}
                                            hint="Number of backup codes generated (5-20)"
                                        />
                                    </div>
                                </>
                            )}

                            {activeTab === 'password' && (
                                <>
                                    <CardHeader
                                        title="Password Policy"
                                        icon={Key}
                                        color="text-purple-400"
                                        description="Set password strength requirements"
                                    />
                                    <div className="space-y-4">
                                        <SettingsInput
                                            label="Minimum Length"
                                            type="number"
                                            value={settings.password.minLength}
                                            onChange={(v) => updateSettings('password', 'minLength', parseInt(v) || 8)}
                                            hint="Minimum characters required (6-32)"
                                        />
                                        <SettingsToggle
                                            label="Require Uppercase Letter"
                                            enabled={settings.password.requireUppercase}
                                            onChange={(v) => updateSettings('password', 'requireUppercase', v)}
                                            description="At least one uppercase letter (A-Z)"
                                        />
                                        <SettingsToggle
                                            label="Require Number"
                                            enabled={settings.password.requireNumber}
                                            onChange={(v) => updateSettings('password', 'requireNumber', v)}
                                            description="At least one digit (0-9)"
                                        />
                                        <SettingsToggle
                                            label="Require Special Character"
                                            enabled={settings.password.requireSpecial}
                                            onChange={(v) => updateSettings('password', 'requireSpecial', v)}
                                            description="At least one special character (!@#$%^&*)"
                                        />
                                    </div>
                                </>
                            )}

                            {activeTab === 'session' && (
                                <>
                                    <CardHeader
                                        title="Session Management"
                                        icon={Clock}
                                        color="text-amber-400"
                                        description="Configure token expiry and session limits"
                                    />
                                    <div className="space-y-4">
                                        <SettingsInput
                                            label="Token Expiry"
                                            type="number"
                                            value={settings.session.tokenExpiryDays}
                                            onChange={(v) => updateSettings('session', 'tokenExpiryDays', parseInt(v) || 7)}
                                            suffix="days"
                                            hint="How long tokens remain valid (1-30 days)"
                                        />
                                        <SettingsInput
                                            label="Max Concurrent Sessions"
                                            type="number"
                                            value={settings.session.maxConcurrentSessions}
                                            onChange={(v) => updateSettings('session', 'maxConcurrentSessions', parseInt(v) || 5)}
                                            hint="Maximum active sessions per user (1-10)"
                                        />
                                    </div>
                                </>
                            )}

                            {activeTab === 'captcha' && (
                                <>
                                    <CardHeader
                                        title="Captcha Settings"
                                        icon={Bot}
                                        color="text-blue-400"
                                        description="Bot protection for login and registration"
                                    />
                                    <div className="space-y-4">
                                        <SettingsToggle
                                            label="Enable Captcha"
                                            enabled={settings.captcha.enabled}
                                            onChange={(v) => updateSettings('captcha', 'enabled', v)}
                                            description="Require captcha on login and registration"
                                        />
                                        <SettingsSelect
                                            label="Captcha Provider"
                                            value={settings.captcha.provider}
                                            options={[
                                                { value: 'hcaptcha', label: 'hCaptcha (Privacy-focused)' },
                                                { value: 'recaptcha', label: 'Google reCAPTCHA' }
                                            ]}
                                            onChange={(v) => updateSettings('captcha', 'provider', v)}
                                        />
                                    </div>
                                </>
                            )}

                            {activeTab === 'email' && (
                                <>
                                    <CardHeader
                                        title="Email Verification"
                                        icon={Mail}
                                        color="text-rose-400"
                                        description="Email verification and disposable email blocking"
                                    />
                                    <div className="space-y-4">
                                        <SettingsToggle
                                            label="Require Email Verification"
                                            enabled={settings.email.verificationRequired}
                                            onChange={(v) => updateSettings('email', 'verificationRequired', v)}
                                            description="Users must verify email before accessing features"
                                        />
                                        <SettingsInput
                                            label="Verification Link Expiry"
                                            type="number"
                                            value={settings.email.verificationExpiryHours}
                                            onChange={(v) => updateSettings('email', 'verificationExpiryHours', parseInt(v) || 24)}
                                            suffix="hours"
                                            hint="How long verification links remain valid (1-72 hours)"
                                        />

                                        <div className="border-t border-white/10 my-6 pt-6">
                                            <h4 className="text-sm font-medium text-white mb-4">Disposable Email Blocking</h4>
                                            <div className="space-y-3">
                                                <SettingsToggle
                                                    label="Block Disposable Emails"
                                                    enabled={settings.disposableEmail.enabled}
                                                    onChange={(v) => updateSettings('disposableEmail', 'enabled', v)}
                                                    description="Prevent registration with temp/throwaway email addresses"
                                                />
                                                <SettingsToggle
                                                    label="Block Public Email Providers"
                                                    enabled={settings.disposableEmail.blockPublicProviders}
                                                    onChange={(v) => updateSettings('disposableEmail', 'blockPublicProviders', v)}
                                                    description="Block Gmail, Yahoo, Outlook (business emails only)"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'security' && (
                                <>
                                    <CardHeader
                                        title="Rate Limiting & Security"
                                        icon={Shield}
                                        color="text-indigo-400"
                                        description="Configure brute-force protection"
                                    />
                                    <div className="space-y-4">
                                        <SettingsInput
                                            label="Auth Attempts per Minute"
                                            type="number"
                                            value={settings.rateLimit.authAttemptsPerMinute}
                                            onChange={(v) => updateSettings('rateLimit', 'authAttemptsPerMinute', parseInt(v) || 5)}
                                            hint="Maximum login attempts before rate limiting (3-20)"
                                        />
                                        <SettingsInput
                                            label="Account Lockout Duration"
                                            type="number"
                                            value={settings.rateLimit.lockoutDurationMinutes}
                                            onChange={(v) => updateSettings('rateLimit', 'lockoutDurationMinutes', parseInt(v) || 15)}
                                            suffix="minutes"
                                            hint="How long accounts are locked after failed attempts (5-60)"
                                        />

                                        <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                            <div className="flex items-start gap-3">
                                                <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <h4 className="font-medium text-amber-300 text-sm">Security Notice</h4>
                                                    <p className="text-xs text-amber-200/70 mt-1">
                                                        Changes to security settings take effect immediately.
                                                        Review carefully before saving.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </PremiumCard>
                </div>
            </div>
        </div>
    )
}
