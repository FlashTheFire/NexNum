"use client"

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Settings, Globe, DollarSign, Shield, Bell, Save,
    RefreshCw, AlertTriangle, Check, Moon, Sun, Send, Mail
} from 'lucide-react'
import { toast } from 'sonner'
import LoadingScreen from '@/components/ui/LoadingScreen'

interface SettingsData {
    general: {
        siteName: string
        emailSender: string
        timezone: string
        maintenanceMode: boolean
        maintenanceMessage: string
    }
    pricing: {
        defaultMarkup: number
        fixedMarkup: number
        minPrice: number
        currency: string
    }
    rateLimit: {
        apiLimit: number
        authLimit: number
        adminLimit: number
    }
    notifications: {
        emailEnabled: boolean
        lowBalanceThreshold: number
        syncFailureAlert: boolean
    }
}

import { BannedIconsTable } from './BannedIconsTable'

type TabType = 'general' | 'pricing' | 'rateLimit' | 'notifications' | 'emailTester' | 'assets'

const tabs = [
    { id: 'general' as TabType, label: 'General', icon: Globe },
    { id: 'pricing' as TabType, label: 'Pricing', icon: DollarSign },
    { id: 'rateLimit' as TabType, label: 'Rate Limits', icon: Shield },
    { id: 'notifications' as TabType, label: 'Notifications', icon: Bell },
    { id: 'assets' as TabType, label: 'Assets', icon: AlertTriangle },
    { id: 'emailTester' as TabType, label: 'Email Tester', icon: Mail },
]

// Premium input component
function SettingsInput({
    label,
    value,
    onChange,
    type = 'text',
    hint,
    suffix,
    placeholder,
}: {
    label: string
    value: string | number
    onChange: (value: string) => void
    type?: 'text' | 'number'
    hint?: string
    suffix?: string
    placeholder?: string
}) {
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">{label}</label>
            <div className="relative">
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
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

// Toggle switch component
function SettingsToggle({
    label,
    enabled,
    onChange,
    description,
}: {
    label: string
    enabled: boolean
    onChange: (enabled: boolean) => void
    description?: string
}) {
    return (
        <div className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-700/50">
            <div>
                <p className="font-medium text-white">{label}</p>
                {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
            </div>
            <button
                onClick={() => onChange(!enabled)}
                className={`relative w-14 h-7 rounded-full transition-colors ${enabled ? 'bg-violet-600' : 'bg-gray-700'
                    }`}
            >
                <span
                    className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-7' : 'translate-x-0'
                        }`}
                />
            </button>
        </div>
    )
}

// Section card wrapper
function SettingsSection({
    title,
    description,
    children
}: {
    title: string
    description?: string
    children: React.ReactNode
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-6"
        >
            <div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
            </div>
            <div className="space-y-4">{children}</div>
        </motion.div>
    )
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<SettingsData | null>(null)
    const [activeTab, setActiveTab] = useState<TabType>('general')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [testRecipient, setTestRecipient] = useState('')
    const [sendingTest, setSendingTest] = useState<string | null>(null)

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings')
            if (res.ok) {
                const data = await res.json()
                setSettings(data.settings)
            }
        } catch (error) {
            toast.error('Failed to load settings')
        } finally {
            setLoading(false)
        }
    }

    const updateSetting = <K extends keyof SettingsData>(
        section: K,
        key: keyof SettingsData[K],
        value: any
    ) => {
        if (!settings) return
        setSettings({
            ...settings,
            [section]: {
                ...settings[section],
                [key]: value,
            },
        })
        setHasChanges(true)
    }

    const saveSettings = async () => {
        if (!settings) return
        setSaving(true)

        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    section: activeTab,
                    updates: (activeTab === 'general' || activeTab === 'pricing' || activeTab === 'rateLimit' || activeTab === 'notifications')
                        ? settings[activeTab]
                        : {},
                }),
            })

            if (res.ok) {
                toast.success('Settings saved successfully')
                setHasChanges(false)
            } else {
                toast.error('Failed to save settings')
            }
        } catch (error) {
            toast.error('Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    const sendTestEmail = async (template: string) => {
        if (!testRecipient) {
            toast.error('Please enter a recipient email')
            return
        }
        setSendingTest(template)
        try {
            const res = await fetch('/api/admin/debug/test-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template, to: testRecipient })
            })
            const data = await res.json()
            if (res.ok) {
                toast.success(`Sent ${template} email to ${testRecipient}`)
            } else {
                toast.error(data.error || 'Failed to send')
            }
        } catch (e) {
            toast.error('Failed to send test email')
        } finally {
            setSendingTest(null)
        }
    }

    if (loading) {
        return <LoadingScreen status="Loading Settings" />
    }

    if (!settings) return null

    return (
        <main className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <motion.h1
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl font-bold text-white flex items-center gap-3"
                    >
                        <span className="w-2 h-8 bg-gradient-to-b from-violet-500 to-violet-700 rounded-full" />
                        Settings
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: 0.1 } }}
                        className="text-gray-400 mt-2"
                    >
                        Configure system-wide settings and preferences
                    </motion.p>
                </div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3"
                >
                    {hasChanges && (
                        <span className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3" />
                            Unsaved changes
                        </span>
                    )}
                    <button
                        onClick={saveSettings}
                        disabled={!hasChanges || saving}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${hasChanges
                            ? 'bg-violet-600 text-white hover:bg-violet-700'
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        {saving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save Changes
                    </button>
                </motion.div>
            </div>

            {/* Tab Navigation */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 mb-6 p-1 bg-gray-900/50 rounded-xl overflow-x-auto border border-gray-800"
            >
                {tabs.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap ${isActive
                                ? 'bg-violet-600 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </motion.div>

            {/* Settings Content */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
            >
                {activeTab === 'general' && (
                    <>
                        <SettingsSection title="Site Configuration" description="Basic application settings">
                            <SettingsInput
                                label="Site Name"
                                value={settings.general.siteName}
                                onChange={(v) => updateSetting('general', 'siteName', v)}
                                hint="Displayed in emails and the browser title"
                            />
                            <SettingsInput
                                label="Sender Email"
                                value={settings.general.emailSender}
                                onChange={(v) => updateSetting('general', 'emailSender', v)}
                                hint="Must be verified in Resend (e.g. 'onboarding@resend.dev' for testing)"
                            />
                            <SettingsInput
                                label="Timezone"
                                value={settings.general.timezone}
                                onChange={(v) => updateSetting('general', 'timezone', v)}
                                hint="Used for scheduled tasks and reports"
                            />
                        </SettingsSection>
                        <SettingsSection title="Maintenance Mode">
                            <SettingsToggle
                                label="Enable Maintenance Mode"
                                enabled={settings.general.maintenanceMode}
                                onChange={(v) => updateSetting('general', 'maintenanceMode', v)}
                                description="When enabled, users will see a maintenance page"
                            />
                            {settings.general.maintenanceMode && (
                                <SettingsInput
                                    label="Maintenance Message"
                                    value={settings.general.maintenanceMessage}
                                    onChange={(v) => updateSetting('general', 'maintenanceMessage', v)}
                                />
                            )}
                        </SettingsSection>
                    </>
                )}

                {activeTab === 'pricing' && (
                    <SettingsSection title="Pricing Configuration" description="Default pricing rules for all providers">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <SettingsInput
                                label="Default Markup Multiplier"
                                value={settings.pricing.defaultMarkup}
                                onChange={(v) => updateSetting('pricing', 'defaultMarkup', parseFloat(v) || 1)}
                                type="number"
                                suffix="x"
                                hint="Applied to provider prices (e.g., 1.2 = 20% markup)"
                            />
                            <SettingsInput
                                label="Fixed Markup"
                                value={settings.pricing.fixedMarkup}
                                onChange={(v) => updateSetting('pricing', 'fixedMarkup', parseFloat(v) || 0)}
                                type="number"
                                suffix="$"
                                hint="Added after multiplier"
                            />
                            <SettingsInput
                                label="Minimum Price"
                                value={settings.pricing.minPrice}
                                onChange={(v) => updateSetting('pricing', 'minPrice', parseFloat(v) || 0)}
                                type="number"
                                suffix="$"
                                hint="Lowest possible sale price"
                            />
                            <SettingsInput
                                label="Currency"
                                value={settings.pricing.currency}
                                onChange={(v) => updateSetting('pricing', 'currency', v)}
                                hint="Display currency code"
                            />
                        </div>
                    </SettingsSection>
                )}

                {activeTab === 'rateLimit' && (
                    <SettingsSection title="Rate Limiting" description="Configure API request limits (per minute)">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <SettingsInput
                                label="General API Limit"
                                value={settings.rateLimit.apiLimit}
                                onChange={(v) => updateSetting('rateLimit', 'apiLimit', parseInt(v) || 100)}
                                type="number"
                                suffix="req/min"
                            />
                            <SettingsInput
                                label="Auth Limit"
                                value={settings.rateLimit.authLimit}
                                onChange={(v) => updateSetting('rateLimit', 'authLimit', parseInt(v) || 5)}
                                type="number"
                                suffix="req/min"
                                hint="Login/signup attempts"
                            />
                            <SettingsInput
                                label="Admin API Limit"
                                value={settings.rateLimit.adminLimit}
                                onChange={(v) => updateSetting('rateLimit', 'adminLimit', parseInt(v) || 30)}
                                type="number"
                                suffix="req/min"
                            />
                        </div>
                    </SettingsSection>
                )}

                {activeTab === 'notifications' && (
                    <SettingsSection title="Notification Preferences" description="Configure system alerts and notifications">
                        <SettingsToggle
                            label="Email Notifications"
                            enabled={settings.notifications.emailEnabled}
                            onChange={(v) => updateSetting('notifications', 'emailEnabled', v)}
                            description="Send email alerts for critical events"
                        />
                        <SettingsInput
                            label="Low Balance Threshold"
                            value={settings.notifications.lowBalanceThreshold}
                            onChange={(v) => updateSetting('notifications', 'lowBalanceThreshold', parseFloat(v) || 10)}
                            type="number"
                            suffix="$"
                            hint="Alert when provider balance drops below this"
                        />
                        <SettingsToggle
                            label="Sync Failure Alerts"
                            enabled={settings.notifications.syncFailureAlert}
                            onChange={(v) => updateSetting('notifications', 'syncFailureAlert', v)}
                            description="Notify when provider sync fails"
                        />
                    </SettingsSection>
                )}

                {activeTab === 'emailTester' && (
                    <SettingsSection title="Email Template Tester" description="Send test emails to verify templates (SMTP check)">
                        <div className="space-y-6">
                            <SettingsInput
                                label="Recipient Email"
                                value={testRecipient}
                                onChange={setTestRecipient}
                                placeholder="sysadmin@example.com"
                                type="text"
                                hint="Where should we send the test emails?"
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                    { id: 'welcome', label: 'Welcome Email' },
                                    { id: 'verification', label: 'Verification Code' },
                                    { id: 'deposit', label: 'Deposit Receipt' },
                                    { id: 'purchase', label: 'Purchase Receipt' },
                                    { id: 'invoice', label: 'Invoice' },
                                    { id: 'security', label: 'Security Alert' },
                                    { id: 'apiKey', label: 'API Notification' },
                                    { id: 'maintenance', label: 'Maintenance Notice' },
                                    { id: 'lowBalance', label: 'Low Balance Alert' },
                                    { id: 'announcement', label: 'Announcement' },
                                ].map((template) => (
                                    <button
                                        key={template.id}
                                        onClick={() => sendTestEmail(template.id)}
                                        disabled={!!sendingTest}
                                        className="flex items-center justify-between p-4 bg-gray-800/50 hover:bg-violet-600/20 border border-gray-700 hover:border-violet-500/50 rounded-xl transition-all group"
                                    >
                                        <span className="text-gray-300 group-hover:text-white font-medium">{template.label}</span>
                                        {sendingTest === template.id ? (
                                            <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
                                        ) : (
                                            <Send className="w-4 h-4 text-gray-500 group-hover:text-violet-400" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </SettingsSection>
                )}

                {activeTab === 'assets' && (
                    <SettingsSection title="Asset Management" description="Manage banned icons and other static assets">
                        <BannedIconsTable />
                    </SettingsSection>
                )}
            </motion.div>
        </main>
    )
}
