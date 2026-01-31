"use client"

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Shield, Key, Lock, Clock, Bot, Mail, AlertTriangle, Save,
    RefreshCw, Check, Eye, EyeOff, Globe, Smartphone, Users
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
    { id: 'oauth' as TabType, label: 'OAuth', icon: Globe },
    { id: 'twoFactor' as TabType, label: '2FA', icon: Smartphone },
    { id: 'password' as TabType, label: 'Password', icon: Key },
    { id: 'session' as TabType, label: 'Sessions', icon: Clock },
    { id: 'captcha' as TabType, label: 'Captcha', icon: Bot },
    { id: 'email' as TabType, label: 'Email', icon: Mail },
    { id: 'security' as TabType, label: 'Security', icon: Shield },
]

// Input Component
function SettingsInput({
    label, value, onChange, type = 'text', hint, suffix, disabled
}: {
    label: string
    value: string | number
    onChange: (value: string) => void
    type?: 'text' | 'number'
    hint?: string
    suffix?: string
    disabled?: boolean
}) {
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">{label}</label>
            <div className="relative">
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all disabled:opacity-50"
                />
                {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                        {suffix}
                    </span>
                )}
            </div>
            {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
    )
}

// Toggle Component
function SettingsToggle({
    label, enabled, onChange, description
}: {
    label: string
    enabled: boolean
    onChange: (enabled: boolean) => void
    description?: string
}) {
    return (
        <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-xl border border-gray-700/50">
            <div>
                <span className="text-sm font-medium text-white">{label}</span>
                {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
            </div>
            <button
                onClick={() => onChange(!enabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-violet-600' : 'bg-gray-600'}`}
            >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'left-7' : 'left-1'}`} />
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
            <label className="block text-sm font-medium text-gray-300">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
            {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
    )
}

export default function AuthenticationSettingsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('oauth')
    const [settings, setSettings] = useState<AuthSettings>(defaultSettings)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)

    useEffect(() => {
        fetchSettings()
    }, [])

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
                headers: { 'Content-Type': 'application/json' },
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

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen p-4 md:p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                        <Shield className="w-8 h-8 text-violet-500" />
                        Authentication Settings
                    </h1>
                    <p className="text-gray-400 mt-1">Manage authentication and security configuration</p>
                </div>
                <button
                    onClick={saveSettings}
                    disabled={!hasChanges || saving}
                    className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl text-white font-medium transition-all"
                >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Tabs */}
                <div className="lg:w-56 flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-violet-600 text-white'
                                : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-white'
                                }`}
                        >
                            <tab.icon className="w-5 h-5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800 p-6">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-6"
                    >
                        {activeTab === 'oauth' && (
                            <>
                                <h2 className="text-xl font-semibold text-white mb-4">OAuth Providers</h2>
                                <div className="space-y-4">
                                    <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                                                    <svg className="w-6 h-6" viewBox="0 0 24 24">
                                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h3 className="font-medium text-white">Google OAuth</h3>
                                                    <p className="text-xs text-gray-500">Sign in with Google</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => updateNestedSettings('oauth', 'google', 'enabled', !settings.oauth.google.enabled)}
                                                className={`relative w-12 h-6 rounded-full transition-colors ${settings.oauth.google.enabled ? 'bg-violet-600' : 'bg-gray-600'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.oauth.google.enabled ? 'left-7' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        <SettingsInput
                                            label="Client ID"
                                            value={settings.oauth.google.clientId}
                                            onChange={(v) => updateNestedSettings('oauth', 'google', 'clientId', v)}
                                            hint="From Google Cloud Console"
                                            disabled={!settings.oauth.google.enabled}
                                        />
                                    </div>

                                    <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h3 className="font-medium text-white">GitHub OAuth</h3>
                                                    <p className="text-xs text-gray-500">Sign in with GitHub</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => updateNestedSettings('oauth', 'github', 'enabled', !settings.oauth.github.enabled)}
                                                className={`relative w-12 h-6 rounded-full transition-colors ${settings.oauth.github.enabled ? 'bg-violet-600' : 'bg-gray-600'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.oauth.github.enabled ? 'left-7' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        <SettingsInput
                                            label="Client ID"
                                            value={settings.oauth.github.clientId}
                                            onChange={(v) => updateNestedSettings('oauth', 'github', 'clientId', v)}
                                            hint="From GitHub Developer Settings"
                                            disabled={!settings.oauth.github.enabled}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {activeTab === 'twoFactor' && (
                            <>
                                <h2 className="text-xl font-semibold text-white mb-4">Two-Factor Authentication</h2>
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
                                <h2 className="text-xl font-semibold text-white mb-4">Password Policy</h2>
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
                                <h2 className="text-xl font-semibold text-white mb-4">Session Management</h2>
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
                                <h2 className="text-xl font-semibold text-white mb-4">Captcha Settings</h2>
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
                                <h2 className="text-xl font-semibold text-white mb-4">Email Verification</h2>
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
                                </div>

                                <div className="border-t border-gray-700 my-6" />

                                <h2 className="text-xl font-semibold text-white mb-4">Disposable Email Blocking</h2>
                                <div className="space-y-4">
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
                            </>
                        )}

                        {activeTab === 'security' && (
                            <>
                                <h2 className="text-xl font-semibold text-white mb-4">Security & Rate Limiting</h2>
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
                                    <div className="mt-6 p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                                            <div>
                                                <h4 className="font-medium text-amber-300">Security Notice</h4>
                                                <p className="text-sm text-amber-200/70 mt-1">
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
                </div>
            </div>
        </div>
    )
}
