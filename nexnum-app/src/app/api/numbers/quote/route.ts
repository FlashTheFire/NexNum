import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import { SmartSmsRouter } from '@/lib/providers/smart-router'
import { z } from 'zod'

// Instantiate router (it uses singletons internally)
const smartRouter = new SmartSmsRouter()

const schema = z.object({
    country: z.string(),
    service: z.string()
})

export async function POST(request: Request) {
    const auth = await AuthGuard.requireUser()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { country, service } = schema.parse(body)

        // Get ranked providers from the Smart Router
        const quotes = await smartRouter.getRankedProviders(country, service)

        // Get Best Route info (only if >1 provider)
        const bestRouteQuote = await smartRouter.getBestRouteQuote(country, service)

        // We only want to show the specific best option and maybe 1 alternative
        const bestOption = quotes[0]

        return NextResponse.json({
            success: true,
            bestRoute: bestOption ? {
                provider: bestOption.displayName,
                reliability: bestOption.reliability,
                estimatedTime: `${Math.round(bestOption.estimatedTime)}ms`,
                features: ['Instant SMS', 'High Success Rate']
            } : null,
            alternatives: quotes.slice(1, 3).map(q => ({
                provider: q.displayName,
                reliability: q.reliability
            })),
            // NEW: Best Route with fallback info (only when >1 provider)
            smartRoute: bestRouteQuote ? {
                enabled: true,
                topProvider: bestRouteQuote.topProvider,
                fallbackCount: bestRouteQuote.fallbackCount,
                priceRange: bestRouteQuote.priceRange,
                estimatedReliability: bestRouteQuote.estimatedReliability,
                // Full provider list for max price selection
                providers: bestRouteQuote.providers
            } : null
        })

    } catch (error) {
        return NextResponse.json({ error: 'Failed to generate quote' }, { status: 500 })
    }
}

