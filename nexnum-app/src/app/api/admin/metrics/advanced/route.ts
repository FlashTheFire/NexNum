/**
 * Advanced Metrics API
 * 
 * Professional operational intelligence dashboard endpoint.
 * 
 * Endpoints:
 * GET /api/admin/metrics/advanced                    → All providers, all metrics
 * GET /api/admin/metrics/advanced?provider=grizzlysms → Single provider metrics
 * GET /api/admin/metrics/advanced?window=1440        → Custom time window (minutes)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { AdvancedMetricsCalculator, SystemMetrics, ProviderMetrics } from '@/lib/metrics/advanced-metrics'

// Cache for expensive calculations
let metricsCache: { data: SystemMetrics; expiry: number } | null = null
const CACHE_TTL_MS = 30 * 1000 // 30 seconds

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const providerFilter = searchParams.get('provider')
    const windowMinutes = parseInt(searchParams.get('window') || '60', 10)
    const forceRefresh = searchParams.get('refresh') === 'true'
    const format = searchParams.get('format') // 'full' | 'summary' | 'table'

    try {
        // Check cache
        const now = Date.now()
        if (!forceRefresh && metricsCache && metricsCache.expiry > now && !providerFilter) {
            return formatResponse(metricsCache.data, format, providerFilter)
        }

        // Calculate metrics
        const calculator = new AdvancedMetricsCalculator(windowMinutes)
        const metrics = await calculator.calculateAll()

        // Cache if full request
        if (!providerFilter) {
            metricsCache = { data: metrics, expiry: now + CACHE_TTL_MS }
        }

        return formatResponse(metrics, format, providerFilter)

    } catch (error: any) {
        console.error('Advanced metrics error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

function formatResponse(
    metrics: SystemMetrics,
    format: string | null,
    providerFilter: string | null
): NextResponse {
    // Filter by provider if requested
    let providers = metrics.providers
    if (providerFilter) {
        providers = providers.filter(p =>
            p.providerName.toLowerCase() === providerFilter.toLowerCase()
        )
    }

    // Summary format
    if (format === 'summary') {
        return NextResponse.json({
            calculatedAt: metrics.calculatedAt,
            timeWindow: `${metrics.timeWindowMinutes}m`,
            aggregate: metrics.aggregate,
            providerCount: providers.length,
            providers: providers.map(p => ({
                name: p.providerName,
                reliabilityScore: p.providerReliabilityScore.value,
                slaCompliance: p.slaComplianceRate.value,
                availability: p.providerAvailabilityRate.value,
                margin: p.marginPerService.value
            }))
        })
    }

    // Table format (for dashboards)
    if (format === 'table') {
        const rows = providers.map(p => ({
            provider: p.providerName,
            // Success
            adjSuccessRate: `${p.adjustedSuccessRate.value}%`,
            completionRate: `${p.effectiveCompletionRate.value}%`,
            firstAttemptRate: `${p.firstAttemptSuccessRate.value}%`,
            slaCompliance: `${p.slaComplianceRate.value}%`,
            // Performance
            p95Latency: `${p.p95LatencyCompliance.value}ms`,
            p99Latency: `${p.p99LatencyCompliance.value}ms`,
            latencyEfficiency: p.providerLatencyEfficiency.value,
            // Reliability
            reliabilityScore: p.providerReliabilityScore.value,
            availability: `${p.providerAvailabilityRate.value}%`,
            failureRate: `${p.strictFailureRate.value}%`,
            // Financial
            costPerOp: `$${p.costPerSuccessfulOperation.value}`,
            revenuePerOp: `$${p.revenuePerSuccessfulOperation.value}`,
            margin: `${p.marginPerService.value}%`
        }))

        return NextResponse.json({
            calculatedAt: metrics.calculatedAt,
            columns: [
                'provider', 'adjSuccessRate', 'completionRate', 'firstAttemptRate',
                'slaCompliance', 'p95Latency', 'p99Latency', 'reliabilityScore',
                'availability', 'failureRate', 'costPerOp', 'revenuePerOp', 'margin'
            ],
            rows
        })
    }

    // Full format (default)
    return NextResponse.json({
        calculatedAt: metrics.calculatedAt,
        timeWindowMinutes: metrics.timeWindowMinutes,
        aggregate: metrics.aggregate,
        providers: providers.map(p => ({
            meta: {
                providerId: p.providerId,
                providerName: p.providerName,
                calculatedAt: p.calculatedAt
            },
            successReliability: {
                adjustedSuccessRate: p.adjustedSuccessRate,
                effectiveCompletionRate: p.effectiveCompletionRate,
                lateResolutionRatio: p.lateResolutionRatio,
                strictFailureRate: p.strictFailureRate,
                slaComplianceRate: p.slaComplianceRate,
                providerReliabilityScore: p.providerReliabilityScore,
                firstAttemptSuccessRate: p.firstAttemptSuccessRate,
                recoverySuccessRate: p.recoverySuccessRate,
                permanentFailureRatio: p.permanentFailureRatio
            },
            latencyPerformance: {
                providerLatencyEfficiency: p.providerLatencyEfficiency,
                retryImpactRatio: p.retryImpactRatio,
                timeoutBreachRate: p.timeoutBreachRate,
                p95LatencyCompliance: p.p95LatencyCompliance,
                p99LatencyCompliance: p.p99LatencyCompliance
            },
            regional: {
                countryStabilityIndex: p.countryStabilityIndex,
                regionalDegradationIndex: p.regionalDegradationIndex
            },
            operational: {
                operationalIntegrityScore: p.operationalIntegrityScore,
                workerFailureRate: p.workerFailureRate,
                queueSaturationRatio: p.queueSaturationRatio,
                idempotencyViolationRate: p.idempotencyViolationRate,
                providerAvailabilityRate: p.providerAvailabilityRate,
                callbackCompletionRate: p.callbackCompletionRate
            },
            financial: {
                costPerSuccessfulOperation: p.costPerSuccessfulOperation,
                revenuePerSuccessfulOperation: p.revenuePerSuccessfulOperation,
                marginPerService: p.marginPerService
            }
        }))
    })
}
