/**
 * Public API: Get Service Aggregates
 * 
 * Returns precomputed service statistics for fast list responses.
 * No authentication required - public endpoint for Buy flow.
 */

import { NextResponse } from 'next/server'
import { getServiceAggregates } from '@/lib/service-aggregates'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('q') || undefined
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '50')
        const sortBy = searchParams.get('sort') as 'name' | 'price' | 'stock' | undefined

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
        })
    } catch (error) {
        console.error('Service aggregates API error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to fetch services' },
            { status: 500 }
        )
    }
}
