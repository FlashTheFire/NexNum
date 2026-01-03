/**
 * Metrics Endpoint - Prometheus Scraping
 * 
 * GET /api/metrics - Returns Prometheus-format metrics
 */

import { NextResponse } from 'next/server'
import { getMetrics, getMetricsContentType } from '@/lib/metrics'

export async function GET() {
    try {
        const metrics = await getMetrics()

        return new NextResponse(metrics, {
            status: 200,
            headers: {
                'Content-Type': getMetricsContentType()
            }
        })
    } catch (error) {
        console.error('Metrics error:', error)
        return NextResponse.json(
            { error: 'Failed to collect metrics' },
            { status: 500 }
        )
    }
}
