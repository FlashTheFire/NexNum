import { registry } from '@/lib/metrics'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/metrics
 * 
 * Prometheus-format metrics endpoint for scraping.
 * In production, requires bearer token authentication.
 * 
 * Headers:
 * - Authorization: Bearer <METRICS_SCRAPE_TOKEN> (required in production)
 * 
 * Environment Variables:
 * - METRICS_SCRAPE_TOKEN: Token for authenticating Prometheus scraper
 * - METRICS_ALLOWED_IPS: Optional comma-separated list of allowed IPs
 */
export async function GET(request: Request) {
    // Production authentication
    if (process.env.NODE_ENV === 'production') {
        const isAuthorized = validateMetricsScraper(request)
        if (!isAuthorized) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }
    }

    try {
        const metrics = await registry.metrics()
        return new NextResponse(metrics, {
            headers: {
                'Content-Type': registry.contentType,
                // Prevent caching of metrics
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        })
    } catch (err) {
        console.error('Metrics collection error:', err)
        return NextResponse.json(
            { error: 'Failed to collect metrics' },
            { status: 500 }
        )
    }
}

/**
 * Validate that the request is from an authorized metrics scraper.
 * Checks bearer token and optionally IP whitelist.
 */
function validateMetricsScraper(request: Request): boolean {
    const expectedToken = process.env.METRICS_SCRAPE_TOKEN

    // If no token configured, allow access (but log warning)
    if (!expectedToken) {
        console.warn('[Metrics] METRICS_SCRAPE_TOKEN not configured - metrics endpoint is unprotected')
        return true
    }

    // Validate bearer token
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
        return false
    }

    // Optional IP whitelist check
    const allowedIPs = process.env.METRICS_ALLOWED_IPS
    if (allowedIPs) {
        const allowedList = allowedIPs.split(',').map(ip => ip.trim())
        const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown'

        if (!allowedList.includes(clientIP)) {
            console.warn(`[Metrics] Rejected scrape from IP: ${clientIP}`)
            return false
        }
    }

    return true
}
