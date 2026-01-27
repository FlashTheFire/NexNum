"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    CheckCircle, ChevronRight, ChevronLeft, Globe,
    Shield, DollarSign, Server, Command, Play,
    Layout, Zap, Settings2, Activity, HelpCircle, Sparkles, Key, Code2, Database,
    Lock, Smartphone, ArrowRight, Info, Edit, Plug, Link, FileCode, Save, Wand2, FileText
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { MappingEditor, EndpointEditor, VariableHelper, safeParse, PROVIDER_TEMPLATES } from "./editors"
import { JsonEditor } from "@/components/ui/json-editor"
import { InfoTooltip, TT, TTCode } from "@/components/ui/tooltip"
import { AIConfigAssistant, AIAssistantButton } from "@/components/admin/AIConfigAssistant"
import { SafeImage } from "@/components/ui/safe-image"

// --- Types ---

interface WizardProps {
    onComplete: (data: any) => Promise<void>
    onCancel: () => void
}

const STEPS = [
    { num: 1, title: "Technology", icon: Database },
    { num: 2, title: "Identity", icon: Activity },
    { num: 3, title: "Authentication", icon: Lock },
    { num: 4, title: "Economics", icon: DollarSign },
    { num: 5, title: "Configuration", icon: Settings2 },
]

const initialState = {
    template: '',
    type: 'rest', // Default to Future Proof REST
    name: '',
    displayName: '',
    apiBaseUrl: '',
    authType: 'bearer',
    authKey: '',
    authQueryParam: '',
    authHeader: '',
    priceMultiplier: '1.2',
    fixedMarkup: '0.00',
    currency: 'USD',
    endpoints: {},
    mappings: {},
}

export default function ProviderWizard({ onComplete, onCancel }: WizardProps) {
    const [step, setStep] = useState(1)
    const [formData, setFormData] = useState<any>(initialState)
    const [configTab, setConfigTab] = useState<'endpoints' | 'mappings' | 'json'>('endpoints')
    const [jsonCode, setJsonCode] = useState("")
    const [template, setTemplate] = useState<string | null>(null)
    const [aiModalOpen, setAiModalOpen] = useState(false)
    const [aiModalStep, setAiModalStep] = useState<2 | 3 | 5 | 'full'>(2)

    // Sync JSON code when tab changes
    React.useEffect(() => {
        if (configTab === 'json') {
            setJsonCode(JSON.stringify({
                endpoints: formData.endpoints,
                mappings: formData.mappings
            }, null, 2))
        }
    }, [configTab, formData.endpoints, formData.mappings])

    const handleNext = () => setStep(s => Math.min(s + 1, 5))
    const handleBack = () => setStep(s => Math.max(s - 1, 1))

    const openAIAssistant = (forStep: 2 | 3 | 5 | 'full') => {
        setAiModalStep(forStep)
        setAiModalOpen(true)
    }

    const handleAIApply = (data: Record<string, unknown>) => {
        // Helper to safe slugify
        const toSlug = (str: string) => str.toLowerCase().replace(/[^a-z0-9_]/g, '')

        if (aiModalStep === 2) {
            setFormData((prev: typeof formData) => ({
                ...prev,
                name: data.name ? toSlug(data.name as string) : prev.name,
                displayName: (data.displayName || data.name) as string || prev.displayName,
                apiBaseUrl: data.apiBaseUrl || prev.apiBaseUrl,
            }))
            toast.success('Provider identity applied!')
        } else if (aiModalStep === 3) {
            setFormData((prev: typeof formData) => ({
                ...prev,
                authType: data.authType || prev.authType,
                authQueryParam: data.authQueryParam || prev.authQueryParam,
                authHeader: data.authHeader || prev.authHeader,
            }))
            toast.success('Authentication settings applied!')
        } else if (aiModalStep === 5) {
            const endpoints = data.endpoints as Record<string, unknown> | undefined
            const mappings = data.mappings as Record<string, unknown> | undefined

            // In Step 5, we ALSO want to update Auth/Identity if the AI found better ones
            setFormData((prev: typeof formData) => ({
                ...prev,
                // Merge Endpoints & Mappings
                endpoints: endpoints || prev.endpoints,
                mappings: mappings || prev.mappings,
                // Also merge Auth if present (AI is smart enough to detect it late)
                authType: (data.authType as string) || prev.authType,
                authQueryParam: (data.authQueryParam as string) || prev.authQueryParam,
                authHeader: (data.authHeader as string) || prev.authHeader,
                // And Base URL if corrected
                apiBaseUrl: (data.apiBaseUrl as string) || prev.apiBaseUrl
            }))
            toast.success('Configuration applied! (Endpoints, Mappings, Auth updated)')
        } else if (aiModalStep === 'full') {
            // Full Config Application
            const endpoints = data.endpoints as Record<string, unknown> | undefined
            const mappings = data.mappings as Record<string, unknown> | undefined
            const cleanName = data.name ? toSlug(data.name as string) : ''

            setFormData({
                ...initialState, // Reset first
                template: 'universal',
                type: 'rest',
                name: cleanName,
                displayName: (data.displayName || data.name) as string || '',
                apiBaseUrl: (data.apiBaseUrl as string) || '',
                authType: (data.authType as string) || 'bearer',
                authKey: (data.authKey as string) || '',
                authQueryParam: (data.authQueryParam as string) || '',
                authHeader: (data.authHeader as string) || '',
                endpoints: endpoints || {},
                mappings: mappings || {},
                // Defaults
                priceMultiplier: '1.2',
                fixedMarkup: '0.00',
                currency: 'USD'
            })
            setStep(2) // Start walkthrough from Step 2
            toast.success('Magic Import Successful! Please review the configuration.')
        }
    }

    const handleApplyJson = () => {
        try {
            const parsed = JSON.parse(jsonCode)
            if (typeof parsed !== 'object' || !parsed) throw new Error('Root must be an object')

            setFormData((prev: any) => ({
                ...prev,
                endpoints: parsed.endpoints || {},
                mappings: parsed.mappings || {}
            }))
            toast.success('Configuration applied from JSON!')
        } catch (e) {
            toast.error('Invalid JSON: ' + (e as any).message)
        }
    }

    const selectBlueprint = (type: 'universal' | 'template', templateKey?: string) => {
        if (type === 'universal') {
            setFormData({
                ...formData,
                template: 'universal',
                type: 'rest',
                name: '',
                displayName: '',
                apiBaseUrl: '',
                authType: 'bearer',
                authQueryParam: '',
                authHeader: '',
                priceMultiplier: '1.2',
                fixedMarkup: '0.00',
                currency: 'USD',
            })
        } else if (type === 'template' && templateKey) {
            const t = PROVIDER_TEMPLATES[templateKey as keyof typeof PROVIDER_TEMPLATES]
            setFormData({
                ...formData,
                template: templateKey,
                type: (t as any).type || 'rest',
                name: templateKey === 'empty' ? '' : t.name,
                displayName: t.displayName,
                apiBaseUrl: t.baseUrl,
                authType: t.authType,
                authQueryParam: '',
                authHeader: '',
                priceMultiplier: '1.2',
                fixedMarkup: '0.00',
                currency: 'USD',
                endpoints: JSON.parse(t.endpoints),
                mappings: JSON.parse(t.mappings)
            })
        }
        setStep(2)
    }

    const handleSubmit = async () => {
        try {
            await onComplete(formData)
        } catch (e) {
            // Error handled by parent usually, but just in case
            console.error(e)
        }
    }

    // --- Render Helpers ---

    const renderStepIndicator = () => (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 md:mb-6 pb-3 md:pb-4 border-b border-white/5 gap-3">
            <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-[hsl(var(--neon-lime))] shadow-[0_0_15px_hsl(var(--neon-lime)/0.4)]">
                    <Zap size={14} className="text-black fill-black md:w-[18px] md:h-[18px]" />
                </div>
                <div>
                    <h2 className="text-sm md:text-lg font-bold text-white tracking-tight">Add Provider</h2>
                    <div className="text-[8px] md:text-[10px] text-white/40 font-mono uppercase tracking-widest">Step {step} of 5</div>
                </div>
            </div>

            {/* Step Progress - Clickable for completed steps */}
            <div className="flex items-center gap-1 md:gap-1.5 w-full md:w-auto justify-center md:justify-end">
                {STEPS.map((s) => {
                    const isActive = s.num === step
                    const isCompleted = s.num < step
                    const isClickable = isCompleted

                    return (
                        <div key={s.num} className="flex items-center">
                            <button
                                onClick={() => isClickable && setStep(s.num)}
                                disabled={!isClickable}
                                className={`
                                    flex items-center justify-center gap-1 md:gap-1.5 
                                    w-6 h-6 md:w-8 md:h-8 
                                    rounded-full border transition-all duration-300 text-[9px] md:text-[10px]
                                    ${isClickable ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                                    ${isActive
                                        ? 'bg-blue-500/30 border-blue-500 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.4)] scale-110'
                                        : isCompleted
                                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'
                                            : 'bg-white/5 border-white/10 text-gray-600'
                                    }
                                `}
                            >
                                <span className="font-bold font-mono">{s.num}</span>
                            </button>
                            {s.num < 5 && <div className={`w-3 md:w-5 h-[2px] mx-0.5 md:mx-1 rounded-full ${isCompleted ? 'bg-emerald-500/50' : 'bg-white/10'}`} />}
                        </div>
                    )
                })}
            </div>
        </div>
    )

    return (
        <>
            <div className="h-full flex flex-col px-1">
                {renderStepIndicator()}

                {/* Content Container */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <AnimatePresence mode="wait">

                        {/* STEP 1: TECHNOLOGY BLUEPRINT */}
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="text-center space-y-2 mb-6 md:mb-10">
                                    <h3 className="text-lg md:text-2xl font-bold text-white">Choose a Technology Blueprint</h3>
                                    <p className="text-xs md:text-base text-gray-400 max-w-lg mx-auto">Select a foundation for your new provider. Use the <strong>Future-Proof Universal API</strong> for maximum flexibility with modern JSON REST services.</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 max-w-6xl mx-auto">
                                    {/* Magic Import Card - Full Width */}
                                    <div
                                        onClick={() => openAIAssistant('full')}
                                        className="md:col-span-2 lg:col-span-3 group relative bg-gradient-to-r from-violet-900/40 to-fuchsia-900/40 border border-violet-500/30 hover:border-violet-500/60 rounded-2xl md:rounded-3xl p-3 md:p-8 cursor-pointer transition-all hover:shadow-[0_0_40px_rgba(167,139,250,0.2)] overflow-hidden flex flex-row gap-3 md:gap-6 items-center"
                                    >
                                        <div className="hidden md:block absolute top-0 right-0 p-3 md:p-4 opacity-70 group-hover:opacity-100 transition-opacity">
                                            <div className="px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-[10px] font-bold uppercase tracking-widest shadow-lg flex items-center gap-2">
                                                <Sparkles size={10} /> AI Powered
                                            </div>
                                        </div>

                                        <div className="shrink-0 w-12 h-12 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-500">
                                            <Wand2 size={40} className="text-white" />
                                        </div>

                                        <div className="flex-1 text-center md:text-left">
                                            <div className="md:hidden flex justify-center md:justify-start mb-1.5">
                                                <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-[9px] font-bold uppercase tracking-widest shadow-lg flex items-center gap-1.5 w-fit">
                                                    <Sparkles size={8} /> AI Powered
                                                </div>
                                            </div>
                                            <h3 className="text-base md:text-2xl font-bold text-white mb-1 md:mb-2 group-hover:text-violet-200 transition-colors">Magic Import from Docs</h3>
                                            <p className="text-[10px] md:text-sm text-gray-300 leading-relaxed mb-2 md:mb-4 max-w-2xl line-clamp-2 md:line-clamp-none">
                                                Paste your entire API documentation once. Our AI will automatically extract identity, detect authentication, and generate all endpoints & mappings for you.
                                            </p>
                                            <div className="flex flex-wrap justify-center md:justify-start gap-2 text-[10px] items-center text-violet-200/60 font-mono">
                                                <span className="flex items-center gap-1"><CheckCircle size={10} /> One-Click Setup</span>
                                                <span className="flex items-center gap-1"><CheckCircle size={10} /> Auto-Mappings</span>
                                                <span className="flex items-center gap-1"><CheckCircle size={10} /> 95% Faster</span>
                                            </div>
                                        </div>

                                        <div className="shrink-0 w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500 group-hover:text-white transition-all">
                                            <ArrowRight size={20} />
                                        </div>
                                    </div>

                                    {/* Future Proof Card - SPANS 2 or 3 on large screens */}
                                    <div
                                        onClick={() => selectBlueprint('universal')}
                                        className="md:col-span-2 lg:col-span-3 group relative bg-gradient-to-br from-blue-900/10 to-indigo-900/10 border border-blue-500/20 hover:border-blue-500/50 rounded-2xl md:rounded-3xl p-3 md:p-8 cursor-pointer transition-all hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] overflow-hidden flex flex-row gap-3 md:gap-6 items-center"
                                    >
                                        <div className="hidden md:block absolute top-0 right-0 p-3 md:p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                                            <div className="px-2 md:px-3 py-0.5 md:py-1 rounded-full bg-blue-500 text-white text-[8px] md:text-[10px] font-bold uppercase tracking-widest shadow-lg">Recommended</div>
                                        </div>

                                        <div className="shrink-0 w-12 h-12 md:w-20 md:h-20 rounded-xl md:rounded-2xl bg-blue-500 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.4)] group-hover:scale-110 transition-transform">
                                            <Globe size={24} className="text-white md:w-10 md:h-10" />
                                        </div>

                                        <div className="flex-1 text-center md:text-left">
                                            <div className="md:hidden flex justify-center md:justify-start mb-1.5">
                                                <div className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-[8px] font-bold uppercase tracking-widest shadow-lg w-fit">Recommended</div>
                                            </div>
                                            <h3 className="text-sm md:text-xl font-bold text-white mb-1 md:mb-2 group-hover:text-blue-200 transition-colors">Universal REST API</h3>
                                            <p className="text-[10px] md:text-sm text-gray-400 leading-relaxed mb-2 md:mb-4 line-clamp-2 md:line-clamp-none">
                                                The future-proof standard. Fully customizable mappings for any JSON-based API. Supports dynamic field extraction, complex auth flows, and hybrid response types.
                                            </p>
                                            <div className="flex flex-wrap justify-center md:justify-start gap-1.5 md:gap-2 text-[9px] md:text-[10px] items-center text-blue-300/60 font-mono">
                                                <span className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/10">JSON</span>
                                                <span className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/10">REST</span>
                                                <span className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/10">Hybrid</span>
                                            </div>
                                        </div>

                                        <div className="shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
                                            <ArrowRight size={18} />
                                        </div>
                                    </div>
                                </div>

                                {/* Provider Templates - Horizontal Scroll Carousel */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest">Quick Start Templates</span>
                                        <span className="text-[10px] text-white/20">← Scroll →</span>
                                    </div>

                                    <div className="overflow-x-auto pb-4 -mx-1 px-1 scrollbar-hide">
                                        <motion.div
                                            className="flex gap-3 md:gap-4 min-w-max"
                                            initial="hidden"
                                            animate="visible"
                                            variants={{
                                                hidden: {},
                                                visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
                                            }}
                                        >
                                            {/* Provider Template Cards */}
                                            {[
                                                { key: 'mock-sms', logo: '/providers/mock.png', name: 'Mock SMS', desc: 'Local Dev Simulation', color: 'from-violet-500/20 to-fuchsia-500/20', border: 'border-violet-500/20 hover:border-violet-500/50' },
                                                { key: '5sim', logo: '/providers/5sim.png', name: '5sim', desc: 'Virtual numbers worldwide', color: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/20 hover:border-blue-500/50' },
                                                { key: 'grizzlysms', logo: '/providers/grizzlysms.png', name: 'GrizzlySMS', desc: 'SMS-Activate compatible', color: 'from-amber-500/20 to-orange-500/20', border: 'border-amber-500/20 hover:border-amber-500/50' },
                                                { key: 'smsbower', logo: '/providers/smsbower.png', name: 'SMSBower', desc: 'Affordable SMS service', color: 'from-green-500/20 to-emerald-500/20', border: 'border-green-500/20 hover:border-green-500/50' },

                                                { key: 'herosms', logo: '/providers/herosms.png', name: 'HeroSMS', desc: 'Text/Regex SMS provider', color: 'from-red-500/20 to-pink-500/20', border: 'border-red-500/20 hover:border-red-500/50' },
                                            ].map((provider) => (
                                                <motion.div
                                                    key={provider.key}
                                                    variants={{
                                                        hidden: { opacity: 0, y: 15, scale: 0.95 },
                                                        visible: { opacity: 1, y: 0, scale: 1 }
                                                    }}
                                                    whileHover={{ scale: 1.05, y: -3 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => selectBlueprint('template', provider.key)}
                                                    className={`group relative w-[140px] md:w-[180px] shrink-0 bg-gradient-to-br ${provider.color} border ${provider.border} rounded-xl md:rounded-2xl p-3 md:p-4 cursor-pointer transition-shadow hover:shadow-lg`}
                                                >
                                                    <div className="flex flex-col items-center gap-2 md:gap-3">
                                                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center overflow-hidden shadow-lg">
                                                            <SafeImage
                                                                src={provider.logo}
                                                                fallbackSrc="/assets/images/placeholder_provider.png"
                                                                alt={provider.name}
                                                                className="w-full h-full object-cover"
                                                                hideOnError
                                                            />
                                                        </div>
                                                        <div className="text-center">
                                                            <h4 className="text-xs md:text-sm font-bold text-white group-hover:text-white/90">{provider.name}</h4>
                                                            <p className="text-[9px] md:text-[10px] text-white/50 line-clamp-1">{provider.desc}</p>
                                                        </div>
                                                    </div>
                                                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ArrowRight size={10} className="text-white" />
                                                    </div>
                                                </motion.div>
                                            ))}

                                            {/* Custom / Empty Card */}
                                            <motion.div
                                                variants={{
                                                    hidden: { opacity: 0, y: 15, scale: 0.95 },
                                                    visible: { opacity: 1, y: 0, scale: 1 }
                                                }}
                                                whileHover={{ scale: 1.05, y: -3 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => selectBlueprint('template', 'empty')}
                                                className="group relative w-[140px] md:w-[180px] shrink-0 bg-white/5 border border-dashed border-white/20 hover:border-purple-500/50 rounded-xl md:rounded-2xl p-3 md:p-4 cursor-pointer transition-shadow hover:bg-purple-500/5"
                                            >
                                                <div className="flex flex-col items-center justify-center gap-2 md:gap-3 h-full">
                                                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                                        <Settings2 size={20} className="text-purple-400 md:w-6 md:h-6" />
                                                    </div>
                                                    <div className="text-center">
                                                        <h4 className="text-xs md:text-sm font-bold text-white group-hover:text-purple-300">Custom</h4>
                                                        <p className="text-[9px] md:text-[10px] text-white/50">Start from scratch</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </motion.div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 2: IDENTITY */}
                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="bg-black/20 border border-white/5 rounded-3xl p-4 md:p-8 max-w-3xl mx-auto space-y-6 md:space-y-8"
                            >
                                <div className="flex items-center justify-between mb-4 md:mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/5 flex items-center justify-center">
                                            <Activity size={20} className="text-purple-400 md:w-6 md:h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-base md:text-lg font-bold text-white">Provider Identity</h3>
                                            <p className="text-xs md:text-sm text-gray-400">Define how the system identifies and connects to this source.</p>
                                        </div>
                                    </div>
                                    <AIAssistantButton onClick={() => openAIAssistant(2)} />
                                </div>

                                <div className="grid grid-cols-1 gap-4 md:gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <label className="text-[11px] font-bold text-white/60 uppercase tracking-widest">Provider ID</label>
                                            <InfoTooltip content={<>Unique machine-readable ID for the system. Use <TTCode>lowercase-hyphens</TTCode>.</>} />
                                        </div>
                                        <div className="relative group">
                                            <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                                            <Input
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="my-provider-api"
                                                className="pl-10 h-12 bg-black/40 border-white/10 focus:border-blue-500/50 focus:bg-blue-900/5 transition-all text-sm font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-white/5 border border-white/5 rounded-xl p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <label className="text-xs md:text-sm font-bold text-white">Compatibility Mode</label>
                                                <div className="px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[9px] font-bold text-orange-400 uppercase tracking-wider">Strict</div>
                                            </div>
                                            <p className="text-[10px] md:text-xs text-gray-400 max-w-sm">
                                                For providers using query-param auth (e.g. SMS-Activate). All responses are strictly parsed via the new Dynamic Engine.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={formData.type === 'hybrid' || formData.type === 'sms-activate'}
                                            onCheckedChange={(checked) => setFormData({ ...formData, type: checked ? 'hybrid' : 'rest' })}
                                            className="data-[state=checked]:bg-orange-500"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <label className="text-[11px] font-bold text-white/60 uppercase tracking-widest">Display Name</label>
                                        </div>
                                        <Input
                                            value={formData.displayName}
                                            onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                                            placeholder="Awesome SMS Provider"
                                            className="h-12 bg-black/40 border-white/10 focus:border-purple-500/50 focus:bg-purple-900/5 transition-all"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <label className="text-[11px] font-bold text-white/60 uppercase tracking-widest">API Base URL</label>
                                            <InfoTooltip content={<>Root endpoint. No trailing slash. E.g. <TTCode>https://api.example.com/v1</TTCode></>} />
                                        </div>
                                        <div className="relative group">
                                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-400 transition-colors" />
                                            <Input
                                                value={formData.apiBaseUrl}
                                                onChange={e => setFormData({ ...formData, apiBaseUrl: e.target.value })}
                                                placeholder="https://api.provider.com/v1"
                                                className="pl-10 h-12 bg-black/40 border-white/10 focus:border-emerald-500/50 focus:bg-emerald-900/5 transition-all font-mono text-sm text-emerald-300"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 3: AUTHENTICATION */}
                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="space-y-4 max-w-3xl mx-auto"
                            >
                                {/* Section Header */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-white/10 flex items-center justify-center">
                                            <Lock size={16} className="text-orange-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">Security & Access</h3>
                                            <p className="text-[10px] text-white/40">Configure API authentication method</p>
                                        </div>
                                    </div>
                                    <AIAssistantButton onClick={() => openAIAssistant(3)} />
                                </div>

                                {/* Auth Type Selection Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {[
                                        { value: 'bearer', label: 'Bearer', icon: Key, desc: 'JWT/Token' },
                                        { value: 'header', label: 'Header', icon: Shield, desc: 'Custom key' },
                                        { value: 'query_param', label: 'Query', icon: Link, desc: 'URL param' },
                                        { value: 'template', label: 'Template', icon: FileText, desc: '{authKey}' },
                                    ].map((auth) => {
                                        const Icon = auth.icon
                                        const isSelected = formData.authType === auth.value
                                        return (
                                            <button
                                                key={auth.value}
                                                onClick={() => setFormData({ ...formData, authType: auth.value })}
                                                className={`p-3 rounded-xl border transition-all text-left group ${isSelected
                                                    ? 'bg-orange-500/20 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                                                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                                                    }`}
                                            >
                                                <div className={`w-7 h-7 rounded-lg mb-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-orange-500/30' : 'bg-white/10 group-hover:bg-white/15'
                                                    }`}>
                                                    <Icon size={14} className={isSelected ? 'text-orange-400' : 'text-white/50'} />
                                                </div>
                                                <div className={`text-xs font-medium ${isSelected ? 'text-orange-300' : 'text-white/70'}`}>{auth.label}</div>
                                                <div className="text-[9px] text-white/30">{auth.desc}</div>
                                            </button>
                                        )
                                    })}
                                </div>

                                {/* Conditional Fields */}
                                {formData.authType === 'query_param' && (
                                    <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                                <Link size={14} className="text-amber-400" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-xs font-medium text-white">Parameter Name</label>
                                                <span className="text-[9px] text-white/30 ml-2">e.g. api_key, token</span>
                                            </div>
                                        </div>
                                        <Input
                                            value={formData.authQueryParam}
                                            onChange={e => setFormData({ ...formData, authQueryParam: e.target.value })}
                                            placeholder="api_key"
                                            className="h-10 bg-black/30 border-white/10 text-sm font-mono focus:border-amber-500/50 transition-all"
                                        />
                                    </div>
                                )}

                                {formData.authType === 'header' && (
                                    <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                                                <Shield size={14} className="text-cyan-400" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-xs font-medium text-white">Header Name</label>
                                                <span className="text-[9px] text-white/30 ml-2">e.g. X-API-KEY</span>
                                            </div>
                                        </div>
                                        <Input
                                            value={formData.authHeader}
                                            onChange={e => setFormData({ ...formData, authHeader: e.target.value })}
                                            placeholder="X-API-KEY"
                                            className="h-10 bg-black/30 border-white/10 text-sm font-mono focus:border-cyan-500/50 transition-all"
                                        />
                                    </div>
                                )}

                                {formData.authType === 'template' && (
                                    <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                <FileText size={14} className="text-blue-400" />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-xs font-medium text-white">Usage</label>
                                                <div className="text-[9px] text-white/50">Add <TTCode>{'{authKey}'}</TTCode> to your endpoint paths.</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* API Secret Key Card */}
                                {formData.authType !== 'none' && (
                                    <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
                                                <Key size={14} className="text-red-400" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <label className="text-xs font-medium text-white">API Secret Key</label>
                                                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
                                                        <Shield size={8} className="text-emerald-400" />
                                                        <span className="text-[8px] font-bold text-emerald-400 uppercase">AES-256</span>
                                                    </div>
                                                </div>
                                                <span className="text-[9px] text-white/30">Stored securely, never exposed</span>
                                            </div>
                                        </div>
                                        <Input
                                            type="password"
                                            value={formData.authKey}
                                            onChange={e => setFormData({ ...formData, authKey: e.target.value })}
                                            placeholder="sk_live_..."
                                            className="h-10 bg-black/30 border-white/10 text-sm font-mono focus:border-red-500/50 transition-all"
                                        />
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* STEP 4: ECONOMICS */}
                        {step === 4 && (
                            <motion.div
                                key="step4"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="space-y-4 max-w-3xl mx-auto"
                            >
                                {/* Section Header */}
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-white/10 flex items-center justify-center">
                                        <DollarSign size={16} className="text-emerald-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white">Pricing Strategy</h3>
                                        <p className="text-[10px] text-white/40">Configure profit margins and currency</p>
                                    </div>
                                </div>

                                {/* Card: Price Multiplier */}
                                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                <Sparkles size={14} className="text-blue-400" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-white">Price Multiplier</label>
                                                <div className="text-[9px] text-white/30">Applied to base cost</div>
                                            </div>
                                        </div>
                                        <div className="text-xl font-mono font-bold text-blue-400">x{formData.priceMultiplier}</div>
                                    </div>
                                    <input
                                        type="range"
                                        min="1.0"
                                        max="5.0"
                                        step="0.1"
                                        value={formData.priceMultiplier}
                                        onChange={(e) => setFormData({ ...formData, priceMultiplier: e.target.value })}
                                        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    />
                                    <div className="flex justify-between text-[9px] text-white/30 font-mono">
                                        <span>1.0x (No markup)</span>
                                        <span>5.0x (400% profit)</span>
                                    </div>
                                </div>

                                {/* Card: Fixed Markup & Currency */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                                <DollarSign size={14} className="text-amber-400" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-white">Fixed Markup</label>
                                                <div className="text-[9px] text-white/30">Added after multiplier</div>
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 font-mono text-sm">+</span>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={formData.fixedMarkup}
                                                onChange={(e) => setFormData({ ...formData, fixedMarkup: e.target.value })}
                                                className="pl-8 h-10 bg-black/30 border-white/10 focus:border-amber-500/50 font-mono text-sm"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                <Globe size={14} className="text-purple-400" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-white">Currency</label>
                                                <div className="text-[9px] text-white/30">Provider's base currency</div>
                                            </div>
                                        </div>
                                        <select
                                            title="Currency"
                                            value={formData.currency}
                                            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                                            className="w-full h-10 px-3 rounded-lg bg-black/30 border border-white/10 text-sm text-white focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
                                        >
                                            <option value="USD">🇺🇸 USD ($)</option>
                                            <option value="EUR">🇪🇺 EUR (€)</option>
                                            <option value="RUB">🇷🇺 RUB (₽)</option>
                                            <option value="INR">🇮🇳 INR (₹)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Live Preview Card */}
                                <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-transparent rounded-xl border border-emerald-500/20">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-widest mb-1">Live Simulation</div>
                                            <div className="text-xs text-white/60">
                                                Cost <span className="font-mono text-white">10.00</span> → Sell{' '}
                                                <span className="text-emerald-400 font-mono font-bold">
                                                    {(10 * parseFloat(formData.priceMultiplier || '1') + parseFloat(formData.fixedMarkup || '0')).toFixed(2)} {formData.currency}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                                                +{((10 * parseFloat(formData.priceMultiplier || '1') + parseFloat(formData.fixedMarkup || '0')) - 10).toFixed(2)}
                                            </div>
                                            <div className="mt-0.5 text-[9px] font-bold text-emerald-500/50">
                                                ROI {(((10 * parseFloat(formData.priceMultiplier || '1') + parseFloat(formData.fixedMarkup || '0') - 10) / 10) * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* STEP 5: CONFIGURATION */}
                        {step === 5 && (
                            <motion.div
                                key="step5"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="h-full flex flex-col space-y-4"
                            >
                                {/* Header with AI Button */}
                                <div className="flex items-center justify-between px-1 shrink-0">
                                    <div>
                                        <h3 className="text-lg font-bold text-white">API Configuration</h3>
                                        <p className="text-xs text-white/40">Define endpoints and response mappings.</p>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => openAIAssistant(5)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-lg text-xs font-bold text-white shadow-lg shadow-violet-500/20"
                                    >
                                        <Sparkles size={14} /> Smart Generate
                                    </motion.button>
                                </div>

                                <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-hidden">
                                    {/* Main Editor Area */}
                                    <div className="lg:col-span-3 bg-[#0a0a0c]/60 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden flex flex-col h-full">
                                        {/* Tabs Header */}
                                        <div className="flex border-b border-white/5 shrink-0">
                                            <button
                                                onClick={() => setConfigTab('endpoints')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-widest transition-all ${configTab === 'endpoints' ? 'bg-white/5 text-white border-b-2 border-blue-500' : 'text-white/40 hover:text-white hover:bg-white/[0.02]'}`}
                                            >
                                                <Command size={14} /> Endpoints
                                            </button>
                                            <button
                                                onClick={() => setConfigTab('mappings')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-widest transition-all ${configTab === 'mappings' ? 'bg-white/5 text-white border-b-2 border-purple-500' : 'text-white/40 hover:text-white hover:bg-white/[0.02]'}`}
                                            >
                                                <Code2 size={14} /> Mappings
                                            </button>
                                            <button
                                                onClick={() => setConfigTab('json')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-widest transition-all ${configTab === 'json' ? 'bg-white/5 text-white border-b-2 border-green-500' : 'text-white/40 hover:text-white hover:bg-white/[0.02]'}`}
                                            >
                                                <FileCode size={14} /> JSON
                                            </button>
                                        </div>

                                        {/* Editor Content */}
                                        <div className="p-4 flex-1 overflow-y-auto">
                                            <AnimatePresence mode="wait">
                                                {configTab === 'endpoints' ? (
                                                    <motion.div
                                                        key="endpoints"
                                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        <EndpointEditor
                                                            endpoints={formData.endpoints}
                                                            onChange={(v) => setFormData({ ...formData, endpoints: v })}
                                                        />
                                                    </motion.div>
                                                ) : configTab === 'mappings' ? (
                                                    <motion.div
                                                        key="mappings"
                                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        <MappingEditor
                                                            mappings={formData.mappings}
                                                            onChange={(v) => setFormData({ ...formData, mappings: v })}
                                                        />
                                                    </motion.div>
                                                ) : (
                                                    <motion.div
                                                        key="json"
                                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="h-full flex flex-col gap-4"
                                                    >
                                                        <div className="flex-1 min-h-[400px]">
                                                            <JsonEditor
                                                                value={jsonCode}
                                                                onChange={setJsonCode}
                                                                className="h-full"
                                                                minHeight="400px"
                                                            />
                                                        </div>
                                                        <div className="flex justify-end">
                                                            <Button
                                                                onClick={handleApplyJson}
                                                                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                                                            >
                                                                <Save size={16} className="mr-2" /> Apply Configuration
                                                            </Button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    {/* Sidebar Helper */}
                                    <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-1">
                                        <VariableHelper
                                            context={configTab === 'endpoints' ? 'endpoint' : 'mapping'}
                                            onInsert={(v) => toast.info(`Copied ${v} to clipboard!`, { description: "Paste it into the active field." })}
                                        />

                                        <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                                            <div className="flex items-center gap-2 text-white/40">
                                                <Info size={14} />
                                                <span className="text-[10px] uppercase font-bold tracking-widest">Quick Tips</span>
                                            </div>
                                            <ul className="space-y-2">
                                                <li className="text-[10px] text-gray-500 leading-snug">
                                                    • <strong>GrizzlySMS/5sim:</strong> Use <code className="text-orange-400">?api_key={'{authKey}'}</code> in the URL if the global header is overridden.
                                                </li>
                                                <li className="text-[10px] text-gray-500 leading-snug">
                                                    • <strong>Mappings:</strong> Use <code className="text-purple-400">$key</code> to capture dynamic object keys as data.
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>

                {/* Footer Actions */}
                <div className="pt-6 mt-4 border-t border-white/5 flex items-center justify-between shrink-0 pb-1">
                    <Button
                        variant="ghost"
                        onClick={step === 1 ? onCancel : handleBack}
                        className="text-gray-400 hover:text-white"
                    >
                        {step === 1 ? 'Cancel' : 'Back'}
                    </Button>

                    <div className="flex gap-3">
                        {step < 5 ? (
                            <Button
                                onClick={handleNext}
                                disabled={step === 1 && !formData.template && !formData.type}
                                className="bg-white text-black hover:bg-gray-200 px-8"
                            >
                                Next Step <ChevronRight size={16} className="ml-2" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                className="bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime))] hover:opacity-90 px-8 shadow-[0_0_20px_hsl(var(--neon-lime)/0.3)] transition-all"
                            >
                                <CheckCircle size={16} className="ml-2" /> Complete Setup
                            </Button>
                        )}
                    </div>
                </div>
            </div >

            {/* AI Configuration Assistant Modal */}
            < AIConfigAssistant
                isOpen={aiModalOpen}
                onClose={() => setAiModalOpen(false)
                }
                step={aiModalStep}
                onApply={handleAIApply}
            />
        </>
    )
}
