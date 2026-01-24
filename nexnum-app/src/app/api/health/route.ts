import { NextResponse } from 'next/server'
import { withMetrics } from '@/lib/monitoring/http-metrics'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 * 
 * Lightweight liveness probe for load balancers and Kubernetes.
 * Returns immediately without checking dependencies.
 * 
 * For comprehensive health checks, use GET /api/health/detailed
 */
const handler = async () => {
    return NextResponse.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    }, {
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    })
}

export const GET = withMetrics(handler as any, { route: '/api/health' })
