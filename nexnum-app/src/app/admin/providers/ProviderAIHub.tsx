import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Bot, Sparkles, Zap, Bug, FileCode, CheckCircle, AlertCircle, ArrowRight, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { ENDPOINT_METHODS } from "./editors"

interface ProviderAIHubProps {
    currentData: any
    onUpdate: (updates: any) => void
}

type AIMode = 'general' | 'endpoint' | 'debug'

export function ProviderAIHub({ currentData, onUpdate }: ProviderAIHubProps) {
    const [mode, setMode] = useState<AIMode>('general')
    const [selectedEndpoint, setSelectedEndpoint] = useState<string>('getPrices')
    const [input, setInput] = useState("")
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [result, setResult] = useState<any>(null)

    const handleAnalyze = async () => {
        if (!input.trim()) {
            toast.error("Please enter documentation or error trace")
            return
        }

        setIsAnalyzing(true)
        setResult(null)

        try {
            // Construct the prompt based on mode
            let systemPrompt = ""
            let userPrompt = input

            if (mode === 'general') {
                systemPrompt = "You are an expert API Integrator. Analyze the documentation and extract ALL configuration (identity, endpoints, mappings). Return a complete JSON configuration."
                // Add context about current endpoints so AI knows what exists
                userPrompt = `Current Endpoints JSON: ${JSON.stringify(currentData.endpoints)}\n\nDocumentation:\n${input}`
            } else if (mode === 'endpoint') {
                systemPrompt = `You are an expert API Integrator. Analyze the documentation for '${selectedEndpoint}'. 
                
                ### CRITICAL SCHEMA RULES:
                1. "queryParams": MUST be Record<string, string>. NO objects!
                   - CORRECT: "action": "getPrices", "api_key": "$api_key"
                   - WRONG: "action": { "type": "string", "default": ... }
                2. "mappings":
                   - If response is a list, use "type": "json_array".
                   - If response is a dict with dynamic keys (e.g. Country -> Service), use "type": "json_dictionary".
                   - "fields" must be flat paths relative to the item.
                
                Return a JSON object with EXACTLY this structure:
                {
                  "endpoints": { "${selectedEndpoint}": { "method": "GET"|"POST", "path": "...", "queryParams": { "key": "value" } } },
                  "mappings": { "${selectedEndpoint}": { "type": "json_array"|"json_dictionary", "rootPath": "...", "fields": { "cost": "price", "count": "qty" } } }
                }
                Do NOT include any other endpoints or top-level keys.`

                userPrompt = `Target Endpoint: ${selectedEndpoint}\nCurrent Config: ${JSON.stringify({
                    endpoint: typeof currentData.endpoints === 'string' ? (JSON.parse(currentData.endpoints)[selectedEndpoint] || {}) : (currentData.endpoints[selectedEndpoint] || {}),
                    mapping: typeof currentData.mappings === 'string' ? (JSON.parse(currentData.mappings)[selectedEndpoint] || {}) : (currentData.mappings[selectedEndpoint] || {})
                })}\n\nDocumentation:\n${input}`
            } else if (mode === 'debug') {
                systemPrompt = `You are an expert API Debugger. Fix the configuration. 
                Return a JSON object with the corrected structure:
                {
                  "endpoints": { "${selectedEndpoint}": { ... } },
                  "mappings": { "${selectedEndpoint}": { ... } }
                }`
                userPrompt = `Context: Debugging ${selectedEndpoint}\nCurrent Config: ${JSON.stringify(currentData.mappings?.[selectedEndpoint] || {})}\n\nTrace/Error:\n${input}`
            }

            const res = await fetch('/api/admin/ai-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userPrompt,
                    systemPromptOverride: systemPrompt,
                    mode: 'config', // 'config' mode expects JSON return
                    step: 'full' // Reuse the full generation logic structure
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Analysis failed")

            setResult(data.result)
        } catch (error: any) {
            toast.error(error.message || "AI Analysis failed")
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleApply = () => {
        if (!result) return

        let updates: any = {}

        // Smart merging based on result structure
        // The API returns a structure like { identity, endpoints, mappings }
        // We need to merge this into currentData

        try {
            const currentEndpoints = typeof currentData.endpoints === 'string' ? JSON.parse(currentData.endpoints) : currentData.endpoints
            const currentMappings = typeof currentData.mappings === 'string' ? JSON.parse(currentData.mappings) : currentData.mappings

            // Merge Endpoints
            if (result.endpoints) {
                updates.endpoints = JSON.stringify({
                    ...currentEndpoints,
                    ...result.endpoints
                }, null, 2)
            }

            // Merge Mappings
            if (result.mappings) {
                updates.mappings = JSON.stringify({
                    ...currentMappings,
                    ...result.mappings
                }, null, 2)
            }

            // Merge Identity (General mode only)
            if (mode === 'general' && result.identity) {
                if (result.identity.apiBaseUrl) updates.apiBaseUrl = result.identity.apiBaseUrl
                if (result.identity.authType) updates.authType = result.identity.authType
            }

            onUpdate(updates)
            toast.success("Configuration applied successfully")
            setResult(null)
            setInput("")
        } catch (e) {
            console.error("Merge error:", e)
            toast.error("Failed to apply configuration. Check console.")
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header / Mode Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                    onClick={() => setMode('general')}
                    className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${mode === 'general' ? 'bg-blue-500/20 border-blue-500/50 ring-1 ring-blue-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                >
                    <div className="flex items-center gap-3 mb-2 relative z-10">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mode === 'general' ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/40'}`}>
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <span className={`font-semibold ${mode === 'general' ? 'text-white' : 'text-white/60'}`}>Optimization</span>
                    </div>
                    <p className="text-[10px] text-white/40 relative z-10">Analyze full docs to detect and update missing configurations.</p>
                    {mode === 'general' && <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />}
                </button>

                <button
                    onClick={() => setMode('endpoint')}
                    className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${mode === 'endpoint' ? 'bg-purple-500/20 border-purple-500/50 ring-1 ring-purple-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                >
                    <div className="flex items-center gap-3 mb-2 relative z-10">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mode === 'endpoint' ? 'bg-purple-500 text-white' : 'bg-white/10 text-white/40'}`}>
                            <Zap className="w-4 h-4" />
                        </div>
                        <span className={`font-semibold ${mode === 'endpoint' ? 'text-white' : 'text-white/60'}`}>Endpoint</span>
                    </div>
                    <p className="text-[10px] text-white/40 relative z-10">Add or update a specific endpoint (e.g. getPrices).</p>
                    {mode === 'endpoint' && <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />}
                </button>

                <button
                    onClick={() => setMode('debug')}
                    className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${mode === 'debug' ? 'bg-pink-500/20 border-pink-500/50 ring-1 ring-pink-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                >
                    <div className="flex items-center gap-3 mb-2 relative z-10">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mode === 'debug' ? 'bg-pink-500 text-white' : 'bg-white/10 text-white/40'}`}>
                            <Bug className="w-4 h-4" />
                        </div>
                        <span className={`font-semibold ${mode === 'debug' ? 'text-white' : 'text-white/60'}`}>Debugger</span>
                    </div>
                    <p className="text-[10px] text-white/40 relative z-10">Paste an error trace to automatically fix mappings.</p>
                    {mode === 'debug' && <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent" />}
                </button>
            </div>

            {/* Input Section */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-fuchsia-400" />
                        <h3 className="font-semibold text-white">
                            {mode === 'general' && "Full Documentation Analysis"}
                            {mode === 'endpoint' && "Endpoint Configuration"}
                            {mode === 'debug' && "Error Resolution"}
                        </h3>
                    </div>
                    {/* Select Endpoint Dropdown if not General */}
                    {mode !== 'general' && (
                        <select
                            title="Select Endpoint"
                            value={selectedEndpoint}
                            onChange={(e) => setSelectedEndpoint(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white/20"
                        >
                            {ENDPOINT_METHODS.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="relative">
                    <Textarea
                        placeholder={
                            mode === 'general' ? "Paste the full API documentation here..." :
                                mode === 'endpoint' ? `Paste the documentation section for '${selectedEndpoint}'...` :
                                    "Paste the error trace or JSON response here..."
                        }
                        className="min-h-[200px] bg-black/40 border-white/10 text-xs font-mono resize-y"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                    />
                    <div className="absolute bottom-3 right-3">
                        <Button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing || !input.trim()}
                            className="bg-white text-black hover:bg-white/90"
                            size="sm"
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4 mr-2 text-fuchsia-600" />
                                    Generate Config
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Results Preview */}
            <AnimatePresence>
                {result && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-5"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Solution Generated</h4>
                                    <p className="text-xs text-emerald-200/60">AI has successfully created a configuration patch.</p>
                                </div>
                            </div>
                            <Button onClick={handleApply} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                                Apply Changes
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>

                        {/* Diff/Preview Area */}
                        <div className="bg-black/40 border border-emerald-500/10 rounded-lg p-4 overflow-x-auto">
                            <pre className="text-[10px] font-mono text-emerald-200/80">
                                {JSON.stringify(result, null, 2)}
                            </pre>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
