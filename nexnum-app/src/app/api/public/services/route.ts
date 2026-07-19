/**
 * Public API: Get Service Aggregates
 * 
 * Returns precomputed service statistics for fast list responses.
 * No authentication required - public endpoint for Buy flow.
 */

import { NextResponse } from 'next/server'
import { getServiceAggregates } from '@/lib/search/service-aggregates'
import { rateLimiters } from '@/lib/auth/ratelimit'

function getClientIp(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown'
}

export async function GET(request: Request) {
    // Rate limit: 60 req/min per IP for public endpoints
    const ip = getClientIp(request)
    const rl = await rateLimiters.api.limit(`pub:services:${ip}`, 60)
    if (!rl.success) return rl.toResponse()

    try {
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('q') || undefined
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '50')
        const sortBy = searchParams.get('sort') as 'name' | 'pointPrice' | 'stock' | undefined

        const result = await getServiceAggregates({ query, page, limit, sortBy })

        return NextResponse.json({
            success: true,
            services: result.items.map(s => ({
                code: s.serviceCode,
                name: s.serviceName,
                lowestPrice: Number(s.lowestPrice),
                totalStock: Number(s.totalStock),
                countryCount: s.countryCount,
                providerCount: s.providerCount,
                lastUpdatedAt: s.lastUpdatedAt
            })),
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: Math.ceil(result.total / result.limit)
            }
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
            }
        })
    } catch (error) {
        console.error('Service aggregates API error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to fetch services' },
            { status: 500 }
        )
    }
}
