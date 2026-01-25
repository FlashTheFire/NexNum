"use client"

import { useEffect, useState } from "react"
import { Loader2, Trophy, ShieldCheck, Route } from "lucide-react"
import { Card } from "@/components/ui/card"

interface SmartRoute {
    enabled: boolean
    topProvider: string | null
    fallbackCount: number
    priceRange: { min: number, max: number }
    estimatedReliability: string
    providers: Array<{ name: string, price: number, stock: number, reliability: string }>
}

interface Quote {
    bestRoute: {
        provider: string
        reliability: string
        estimatedTime: string
        features: string[]
    } | null
    alternatives: any[]
    smartRoute: SmartRoute | null
}

interface Props {
    country: string
    service: string
    providerCount?: number // If passed, skip the provider check
}

export function SmartRoutingIndicator({ country, service, providerCount }: Props) {
    const [loading, setLoading] = useState(false)
    const [quote, setQuote] = useState<Quote | null>(null)
    const [hasMultipleProviders, setHasMultipleProviders] = useState<boolean | null>(null)

    useEffect(() => {
        if (!country || !service) return

        // If providerCount is passed as prop, use it directly
        if (providerCount !== undefined) {
            setHasMultipleProviders(providerCount > 1)
            return
        }

        // Otherwise, quickly check provider count first
        const checkProviders = async () => {
            try {
                const res = await fetch(
                    `/api/search/providers?service=${encodeURIComponent(service)}&country=${encodeURIComponent(country)}&page=1&limit=2`
                )
                const data = await res.json()
                const total = data.pagination?.total || data.items?.length || 0
                setHasMultipleProviders(total > 1)
            } catch {
                setHasMultipleProviders(false)
            }
        }

        checkProviders()
    }, [country, service, providerCount])

    // Only fetch quote if we confirmed multiple providers
    useEffect(() => {
        if (hasMultipleProviders !== true) {
            setQuote(null)
            return
        }

        setLoading(true)
        const fetchQuote = async () => {
            try {
                await new Promise(r => setTimeout(r, 1000)) // Shorter delay since we already checked

                const res = await fetch('/api/numbers/quote', {
                    method: 'POST',
                    body: JSON.stringify({ country, service })
                })
                const data = await res.json()
                if (data.success) {
                    setQuote(data)
                }
            } finally {
                setLoading(false)
            }
        }

        fetchQuote()
    }, [country, service, hasMultipleProviders])

    // Don't render if not multiple providers or still checking
    if (hasMultipleProviders === null || hasMultipleProviders === false) return null
    if (!loading && (!quote?.smartRoute || !quote.smartRoute.enabled)) return null

    if (loading) {
        return (
            <Card className="p-4 border-violet-500/20 bg-violet-500/5 animate-pulse flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                <div className="space-y-1">
                    <div className="text-sm font-medium text-violet-200">Analyzing routes...</div>
                    <div className="text-xs text-violet-400">Finding optimal provider combination</div>
                </div>
            </Card>
        )
    }

    if (!quote?.smartRoute) return null

    const { smartRoute } = quote

    return (
        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">
                <Route className="w-20 h-20 text-emerald-400" />
            </div>

            <div className="flex items-start gap-4 relative z-10">
                <div className="bg-emerald-500/10 p-2 rounded-lg">
                    <Trophy className="w-6 h-6 text-emerald-400" />
                </div>

                <div className="space-y-1 flex-1">
                    <h3 className="font-semibold text-emerald-100 flex items-center gap-2">
                        Smart Route Available
                        <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            {smartRoute.fallbackCount + 1} Providers
                        </span>
                    </h3>

                    <div className="text-sm text-emerald-200/80">
                        Best: <span className="text-emerald-300 font-medium">{smartRoute.topProvider}</span>
                        {smartRoute.fallbackCount > 0 && (
                            <span className="text-emerald-400/60"> + {smartRoute.fallbackCount} fallback{smartRoute.fallbackCount > 1 ? 's' : ''}</span>
                        )}
                    </div>

                    <div className="flex gap-3 mt-2">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-300/80 bg-emerald-950/30 px-2 py-1 rounded">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {smartRoute.estimatedReliability} Reliability
                        </div>
                        {smartRoute.priceRange.min > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-300/80 bg-emerald-950/30 px-2 py-1 rounded">
                                ${smartRoute.priceRange.min.toFixed(2)} - ${smartRoute.priceRange.max.toFixed(2)}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    )
}


