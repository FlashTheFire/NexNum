"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, X, Loader2, Copy, Check, Wand2, FileText, AlertCircle, AlertTriangle, ShieldCheck, ArrowRight, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface AIConfigAssistantProps {
    isOpen: boolean
    onClose: () => void
    step: 2 | 3 | 5 | 'full'
    onApply: (data: Record<string, unknown>) => void
}

const STEP_TITLES = {
    2: "Generate Provider Identity",
    3: "Detect Authentication",
    5: "Generate Endpoints & Mappings",
    full: "Full Provider Integration (Magic Import)"
}

const STEP_DESCRIPTIONS = {
    2: "Paste the provider's API documentation to extract name, display name, and base URL.",
    3: "Paste the authentication section of the docs to detect the auth method.",
    5: "Paste the full API documentation to generate all endpoints and response mappings.",
    full: "Paste the entire provider API documentation. AI will generate identity, authentication, endpoints, and mappings automatically."
}

// --- CONSTANTS ---
const MAX_WORDS = 2000
const REQUIRED_KEYS = [
    'auth',
    'getCountries',
    'getServices',
    'getNumber',
    'getStatus',
    'setStatus',
    'cancelNumber',
    'nextSms',
    'getBalance',
    'getPrices'
]

const KEY_LABELS: Record<string, string> = {
    auth: "Authentication Details",
    getCountries: "Get Countries Endpoint",
    getServices: "Get Services Endpoint",
    getNumber: "Get Number Endpoint",
    getStatus: "Get Status Endpoint",
    setStatus: "Set Status Endpoint",
    cancelNumber: "Cancel Number Endpoint",
    nextSms: "Next SMS Endpoint",
    getBalance: "Get Balance Endpoint",
    getPrices: "Get Prices Endpoint"
}

export function AIConfigAssistant({ isOpen, onClose, step, onApply }: AIConfigAssistantProps) {
    // --- STATE ---
    const [documentation, setDocumentation] = useState("")
    const [wordCount, setWordCount] = useState(0)

    // Workflow State: 'input' -> 'analyzing' -> 'resolving' -> 'generating' -> 'review'
    const [status, setStatus] = useState<'input' | 'analyzing' | 'resolving' | 'generating' | 'review' | 'error'>('input')

    // Analysis Data
    const [missingKeys, setMissingKeys] = useState<string[]>([])
    const [currentMissingIndex, setCurrentMissingIndex] = useState(0)
    const [supplements, setSupplements] = useState<Record<string, string>>({})
    const [skippedKeys, setSkippedKeys] = useState<string[]>([])

    // Results
    const [result, setResult] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [confidence, setConfidence] = useState(0)
    const [providerType, setProviderType] = useState<'json_api' | 'text_regex' | null>(null)

    // Interactive State (Lifted to top level to avoid Hook misuse)
    const [tempVal, setTempVal] = useState("")
    const [override, setOverride] = useState(false)

    // UI Transitions
    const [loadingStage, setLoadingStage] = useState(0)
    const loadingStages = [
        "Analyzing API Topology...",
        "Identifying Security Protocol...",
        "Drafting Master Architecture...",
        "Refining Identity & Mappings...",
        "Enforcing Future-Proof Standards...",
        "Finalizing Elastic Configuration..."
    ]

    // --- EFFECTS ---
    useEffect(() => {
        const count = documentation.trim().split(/\s+/).filter(w => w.length > 0).length
        setWordCount(count)
    }, [documentation])

    useEffect(() => {
        let interval: NodeJS.Timeout
        if (status === 'generating' || status === 'analyzing') {
            setLoadingStage(0)
            interval = setInterval(() => {
                setLoadingStage(prev => (prev + 1) % loadingStages.length)
            }, 1800)
        }
        return () => clearInterval(interval)
    }, [status])

    // --- HANDLERS ---

    const handleAnalyze = async () => {
        if (!documentation.trim()) {
            setError("Please paste the API documentation first.")
            return
        }
        if (wordCount > MAX_WORDS) {
            setError(`Documentation exceeds limits (${wordCount}/${MAX_WORDS} words). Please trim it.`)
            return
        }

        setStatus('analyzing')
        setError(null)

        try {
            const response = await fetch('/api/admin/ai-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: documentation,
                    step,
                    mode: 'analyze'
                })
            })

            if (!response.ok) throw new Error('Analysis failed')

            const data = await response.json()
            const report = data.result

            // Set detected type
            setProviderType(report.providerType || 'json_api')

            if (data.mock) {
                // Handle mock data specifically
                if (report.missing && report.missing.length > 0) {
                    setMissingKeys(report.missing)
                    setConfidence(report.confidence || 0.5)
                    setStatus('resolving')
                    return
                }
            }

            if (report.missing && report.missing.length > 0) {
                setMissingKeys(report.missing)
                setConfidence(report.confidence || 0.5)
                setStatus('resolving')
            } else {
                // No missing keys? Great, proceed to generate
                setConfidence(1.0)
                generateConfig()
            }
        } catch (e) {
            console.error(e)
            setError("Analysis failed. Proceeding with raw generation...")
            setProviderType('json_api') // Default
            generateConfig()
        }
    }

    const handleResolveSubmit = (key: string, value: string) => {
        setSupplements(prev => ({ ...prev, [key]: value }))
        setTempVal("") // Clear input
        nextMissingItem()
    }

    const handleSkip = (key: string) => {
        setSkippedKeys(prev => [...prev, key])
        setTempVal("") // Clear input
        nextMissingItem()
    }

    const nextMissingItem = () => {
        if (currentMissingIndex < missingKeys.length - 1) {
            setCurrentMissingIndex(prev => prev + 1)
        } else {
            generateConfig()
        }
    }

    const generateConfig = async () => {
        setStatus('generating')
        try {
            const response = await fetch('/api/admin/ai-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: documentation,
                    step,
                    mode: 'generate',
                    supplements,
                    providerType // Pass the detected type
                })
            })

            if (!response.ok) throw new Error('Generation failed')

            const data = await response.json()
            setResult(JSON.stringify(data.result, null, 2))
            setStatus('review')
        } catch {
            setError("Failed to generate configuration.")
            setStatus('error')
        }
    }

    const handleApply = () => {
        if (!result) return
        try {
            const parsed = JSON.parse(result)
            onApply(parsed)
            onClose()
        } catch {
            setError("Invalid JSON result.")
        }
    }

    const handleReset = () => {
        setDocumentation("")
        setResult(null)
        setError(null)
        setStatus('input')
        setMissingKeys([])
        setSupplements({})
        setSkippedKeys([])
        setCurrentMissingIndex(0)

        // Reset interactive state references
        setTempVal("")
        setOverride(false)
    }

    // --- RENDERERS ---

    const renderInputState = () => (
        <div className="space-y-4">
            {/* Instructions */}
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
                <div className="flex items-start gap-2">
                    <FileText size={14} className="text-violet-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-violet-200/80 leading-relaxed">
                        {STEP_DESCRIPTIONS[step]}
                    </p>
                </div>
            </div>

            {/* Documentation Input */}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                        API Documentation
                    </label>
                    <span className={`text-[10px] font-mono ${wordCount > MAX_WORDS ? 'text-red-400 font-bold' : 'text-white/30'}`}>
                        {wordCount} / {MAX_WORDS} words
                    </span>
                </div>
                <textarea
                    value={documentation}
                    onChange={(e) => setDocumentation(e.target.value)}
                    placeholder="Paste the SMS provider API documentation here..."
                    className={`w-full h-64 p-3 bg-black/40 border rounded-xl text-xs text-white placeholder:text-white/20 resize-none focus:outline-none transition-all font-mono
                        ${wordCount > MAX_WORDS ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-violet-500/50'}
                    `}
                />
            </div>
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-200/80">{error}</p>
                </div>
            )}
        </div>
    )

    const renderLoadingState = (mode: 'analyzing' | 'generating') => (
        <div className="h-64 flex flex-col items-center justify-center gap-6">
            <div className="relative">
                <div className="absolute inset-0 blur-xl bg-violet-500/20 animate-pulse rounded-full" />
                <Loader2 size={48} className="text-violet-400 animate-spin relative z-10" />
            </div>

            <div className="flex flex-col items-center gap-2 px-6 text-center">
                <motion.p
                    key={loadingStage}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-xs font-medium text-violet-100/90 tracking-wide"
                >
                    {mode === 'analyzing' ? "Scanning for Gaps..." : loadingStages[loadingStage]}
                </motion.p>
                <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: "0%" }}
                        animate={{ width: `${((loadingStage + 1) / loadingStages.length) * 100}%` }}
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    />
                </div>
            </div>
        </div>
    )

    const renderResolvingState = () => {
        const key = missingKeys[currentMissingIndex]
        const displayLabel = KEY_LABELS[key] || key

        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                        <AlertTriangle className="text-amber-400" size={18} />
                        <h4 className="text-sm font-bold text-amber-100">Missing Information Detected</h4>
                    </div>
                    <p className="text-xs text-amber-200/70">
                        The AI couldn't confidently find details for <strong className="text-amber-100">{displayLabel}</strong>.
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                        Provide Detail manually
                    </label>
                    <Textarea
                        placeholder={`e.g. The endpoint is GET /api/v2/${key}...`}
                        value={tempVal}
                        onChange={e => setTempVal(e.target.value)}
                        className="bg-black/40 border-white/10 text-xs font-mono h-32"
                    />
                </div>

                <div className="flex gap-3 pt-2">
                    <Button
                        variant="outline"
                        onClick={() => { handleSkip(key) }}
                        className="flex-1 border-white/10 text-white/40 hover:text-white hover:bg-white/5"
                    >
                        <SkipForward size={14} className="mr-2" />
                        Skip (Mark Missing)
                    </Button>
                    <Button
                        onClick={() => { handleResolveSubmit(key, tempVal) }}
                        disabled={!tempVal.trim()}
                        className="flex-1 bg-violet-600 hover:bg-violet-500 text-white"
                    >
                        <ArrowRight size={14} className="mr-2" />
                        Next
                    </Button>
                </div>
                <div className="text-center">
                    <span className="text-[10px] text-white/20">
                        Item {currentMissingIndex + 1} of {missingKeys.length}
                    </span>
                </div>
            </div>
        )
    }

    const renderReviewState = () => {
        const hasSkips = skippedKeys.length > 0

        return (
            <div className="space-y-4">
                {/* Checklist Header */}
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasSkips ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {hasSkips ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">
                                {hasSkips ? "Configuration Partial" : "Configuration Complete"}
                            </h4>
                            {providerType && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider ${providerType === 'json_api' ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300'}`}>
                                    {providerType.replace('_', ' ')}
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] text-white/40">
                            Confidence Score: <span className={confidence > 0.8 ? "text-emerald-400" : "text-amber-400"}>{Math.round(confidence * 100)}%</span>
                        </p>
                    </div>
                </div>

                {hasSkips && (
                    <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl space-y-2">
                        <p className="text-[10px] font-bold text-red-300 uppercase">Missing items skipped:</p>
                        <ul className="list-disc list-inside space-y-1">
                            {skippedKeys.map(k => (
                                <li key={k} className="text-[10px] text-red-200/60 font-mono">{KEY_LABELS[k] || k}</li>
                            ))}
                        </ul>
                        <div className="pt-2 flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="override"
                                checked={override}
                                onChange={e => setOverride(e.target.checked)}
                                className="w-3 h-3 rounded bg-white/10 border-white/20"
                            />
                            <label htmlFor="override" className="text-[10px] text-white/60 cursor-pointer select-none">
                                I understand this config is incomplete and wish to proceed manually.
                            </label>
                        </div>
                    </div>
                )}

                {/* JSON Preview */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                            Generated JSON
                        </label>
                        <button
                            onClick={() => {
                                if (result) {
                                    navigator.clipboard.writeText(result)
                                }
                            }}
                            className="text-[10px] text-white/40 hover:text-white flex items-center gap-1"
                        >
                            <Copy size={10} /> Copy
                        </button>
                    </div>
                    <pre className="w-full max-h-48 overflow-auto p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-200 font-mono">
                        {result}
                    </pre>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <Button
                        variant="ghost"
                        onClick={handleReset}
                        className="flex-1 text-white/40 hover:text-white hover:bg-white/5"
                    >
                        Start Over
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={hasSkips && !override}
                        className={`flex-1 ${hasSkips && !override ? 'opacity-50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500'} text-white`}
                    >
                        <Check size={16} className="mr-2" />
                        Apply Config
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: "100%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full md:max-w-2xl bg-[#0a0a0c] border border-white/10 rounded-t-3xl md:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl shadow-violet-900/20"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-violet-500/30 flex items-center justify-center relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    <Sparkles size={18} className="text-violet-400 relative z-10" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        {STEP_TITLES[step]}
                                        <span className="px-1.5 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-[9px] text-violet-300 font-mono tracking-wide">PREMIUM</span>
                                    </h3>
                                    <p className="text-[10px] text-white/40">AI Configuration Assistant • v2.0</p>
                                </div>
                            </div>
                            <button
                                title="Close"
                                onClick={onClose}
                                className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-[300px]">
                            {status === 'input' && renderInputState()}
                            {(status === 'analyzing' || status === 'generating') && renderLoadingState(status)}
                            {status === 'resolving' && renderResolvingState()}
                            {status === 'review' && renderReviewState()}
                            {status === 'error' && (
                                <div className="flex flex-col items-center justify-center h-full space-y-4">
                                    <AlertCircle size={48} className="text-red-500/50" />
                                    <p className="text-white/60 text-center text-sm">{error || "Something went wrong"}</p>
                                    <Button variant="outline" onClick={handleReset}>Try Again</Button>
                                </div>
                            )}
                        </div>

                        {/* Footer - Only show on Input state */}
                        {status === 'input' && (
                            <div className="p-4 border-t border-white/5 bg-white/[0.02]">
                                <Button
                                    onClick={handleAnalyze}
                                    disabled={!documentation.trim() || wordCount > MAX_WORDS}
                                    className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white border-0 h-11 transition-all shadow-lg shadow-violet-500/20"
                                >
                                    <Wand2 size={16} className="mr-2" />
                                    Scan & Generate
                                </Button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

export function AIAssistantButton({ onClick }: { onClick: () => void }) {
    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 hover:from-violet-500/30 hover:to-fuchsia-500/30 border border-violet-500/30 rounded-xl text-xs font-medium text-violet-300 transition-all shadow-sm shadow-violet-500/10 group"
        >
            <Sparkles size={14} className="text-violet-400 group-hover:rotate-12 transition-transform" />
            <span className="hidden md:inline">AI Assistant</span>
            <span className="md:hidden">AI</span>
        </motion.button>
    )
}
