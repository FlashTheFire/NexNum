import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 * 
 * Lightweight liveness probe for load balancers and Kubernetes.
 * Returns immediately without checking dependencies.
 * 
 * For comprehensive health checks, use GET /api/health/detailed
 */
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    }, {
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    })
}
