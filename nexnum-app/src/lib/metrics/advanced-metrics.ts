/**
 * =============================================================================
 * ADVANCED METRICS ENGINE
 * =============================================================================
 * 
 * Professional-grade operational intelligence metrics for SMS provider platform.
 * 
 * Metrics Categories:
 * 1. Success & Reliability (8 metrics)
 * 2. Latency & Performance (4 metrics)
 * 3. Regional Analysis (2 metrics)
 * 4. Operational Health (5 metrics)
 * 5. Financial Analysis (4 metrics)
 * 
 * Data Sources:
 * - Redis: Real-time health data, request logs
 * - Prisma: Transaction history, activation records
 * - Prometheus: System metrics (via internal API)
 */

import { redis } from '@/lib/core/redis'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

// =============================================================================
// TYPES
// =============================================================================

export interface MetricValue {
    value: number
    unit: string
    trend?: 'up' | 'down' | 'stable'
    status: 'excellent' | 'good' | 'warning' | 'critical'
    description: string
}

export interface ProviderMetrics {
    providerId: string
    providerName: string
    calculatedAt: Date
    timeWindowMinutes: number

    // Success & Reliability
    adjustedSuccessRate: MetricValue
    effectiveCompletionRate: MetricValue
    lateResolutionRatio: MetricValue
    strictFailureRate: MetricValue
    slaComplianceRate: MetricValue
    providerReliabilityScore: MetricValue
    firstAttemptSuccessRate: MetricValue
    recoverySuccessRate: MetricValue
    permanentFailureRatio: MetricValue

    // Latency & Performance
    providerLatencyEfficiency: MetricValue
    retryImpactRatio: MetricValue
    timeoutBreachRate: MetricValue
    p95LatencyCompliance: MetricValue
    p99LatencyCompliance: MetricValue

    // Regional
    countryStabilityIndex: MetricValue
    regionalDegradationIndex: MetricValue

    // Operational
    operationalIntegrityScore: MetricValue
    workerFailureRate: MetricValue
    queueSaturationRatio: MetricValue
    idempotencyViolationRate: MetricValue
    providerAvailabilityRate: MetricValue
    callbackCompletionRate: MetricValue

    // Financial
    costPerSuccessfulOperation: MetricValue
    revenuePerSuccessfulOperation: MetricValue
    marginPerService: MetricValue
}

export interface SystemMetrics {
    calculatedAt: Date
    timeWindowMinutes: number
    providers: ProviderMetrics[]
    aggregate: {
        overallHealthScore: MetricValue
        platformSlaCompliance: MetricValue
        totalTransactions: number
        totalRevenue: number
        avgMargin: number
    }
}

// =============================================================================
// THRESHOLDS (Configurable SLA)
// =============================================================================

const SLA = {
    successRate: 0.95,           // 95%
    latencyP95Ms: 2000,          // 2 seconds
    latencyP99Ms: 5000,          // 5 seconds
    completionTimeMinutes: 10,   // 10 min
    availabilityRate: 0.99,      // 99%
}

// =============================================================================
// METRICS CALCULATOR
// =============================================================================

export class AdvancedMetricsCalculator {
    private windowMinutes: number

    constructor(windowMinutes: number = 60) {
        this.windowMinutes = windowMinutes
    }

    /**
     * Calculate all metrics for all providers
     */
    async calculateAll(): Promise<SystemMetrics> {
        const providers = await prisma.provider.findMany({
            where: { isActive: true },
            select: { id: true, name: true, displayName: true, priceMultiplier: true, fixedMarkup: true }
        })

        const providerMetrics: ProviderMetrics[] = []

        for (const provider of providers) {
            const metrics = await this.calculateProviderMetrics(provider.id, provider.name)
            providerMetrics.push(metrics)
        }

        // Calculate aggregate
        const aggregate = this.calculateAggregate(providerMetrics)

        return {
            calculatedAt: new Date(),
            timeWindowMinutes: this.windowMinutes,
            providers: providerMetrics,
            aggregate
        }
    }

    /**
     * Calculate metrics for a single provider
     */
    async calculateProviderMetrics(providerId: string, providerName: string): Promise<ProviderMetrics> {
        const windowStart = new Date(Date.now() - this.windowMinutes * 60 * 1000)

        // Fetch raw data
        const [
            requestLog,
            activations,
            transactions,
            healthData
        ] = await Promise.all([
            this.getRequestLog(providerId),
            this.getActivations(providerName, windowStart),
            this.getTransactions(providerName, windowStart),
            this.getHealthData(providerId)
        ])

        // Calculate each metric
        return {
            providerId,
            providerName,
            calculatedAt: new Date(),
            timeWindowMinutes: this.windowMinutes,

            // Success & Reliability
            adjustedSuccessRate: this.calcAdjustedSuccessRate(requestLog, activations),
            effectiveCompletionRate: this.calcEffectiveCompletionRate(activations),
            lateResolutionRatio: this.calcLateResolutionRatio(activations),
            strictFailureRate: this.calcStrictFailureRate(requestLog),
            slaComplianceRate: this.calcSlaComplianceRate(requestLog, activations),
            providerReliabilityScore: this.calcReliabilityScore(requestLog, healthData),
            firstAttemptSuccessRate: this.calcFirstAttemptSuccessRate(activations),
            recoverySuccessRate: this.calcRecoverySuccessRate(activations),
            permanentFailureRatio: this.calcPermanentFailureRatio(activations),

            // Latency & Performance
            providerLatencyEfficiency: this.calcLatencyEfficiency(requestLog),
            retryImpactRatio: this.calcRetryImpactRatio(activations),
            timeoutBreachRate: this.calcTimeoutBreachRate(activations),
            p95LatencyCompliance: this.calcP95Compliance(requestLog),
            p99LatencyCompliance: this.calcP99Compliance(requestLog),

            // Regional
            countryStabilityIndex: this.calcCountryStabilityIndex(activations),
            regionalDegradationIndex: this.calcRegionalDegradationIndex(activations),

            // Operational
            operationalIntegrityScore: this.calcOperationalIntegrity(requestLog, healthData),
            workerFailureRate: await this.calcWorkerFailureRate(),
            queueSaturationRatio: await this.calcQueueSaturation(),
            idempotencyViolationRate: this.calcIdempotencyViolations(activations),
            providerAvailabilityRate: this.calcAvailabilityRate(healthData),
            callbackCompletionRate: this.calcCallbackCompletion(activations),

            // Financial
            costPerSuccessfulOperation: this.calcCostPerSuccess(transactions, activations),
            revenuePerSuccessfulOperation: this.calcRevenuePerSuccess(transactions, activations),
            marginPerService: this.calcMarginPerService(transactions, activations)
        }
    }

    // =========================================================================
    // DATA FETCHERS
    // =========================================================================

    private async getRequestLog(providerId: string): Promise<any[]> {
        const key = `health:${providerId}:requests`
        const raw = await redis.zrange(key, 0, -1)
        return raw.map(r => {
            try { return JSON.parse(r as string) }
            catch { return null }
        }).filter(Boolean)
    }

    private async getActivations(providerName: string, since: Date): Promise<any[]> {
        return prisma.activation.findMany({
            where: {
                providerId: providerName,
                createdAt: { gte: since }
            },
            select: {
                id: true,
                state: true,
                createdAt: true,
                updatedAt: true,
                expiresAt: true,
                countryCode: true,
                price: true,
                idempotencyKey: true
            }
        })
    }

    private async getTransactions(providerName: string, since: Date): Promise<any[]> {
        return prisma.walletTransaction.findMany({
            where: {
                createdAt: { gte: since },
                description: { contains: providerName }
            },
            select: {
                amount: true,
                type: true,
                createdAt: true
            }
        })
    }

    private async getHealthData(providerId: string): Promise<any> {
        const [circuitState, failures, latencies] = await Promise.all([
            redis.get(`health:${providerId}:circuit`),
            redis.get(`health:${providerId}:failures`),
            redis.lrange(`health:${providerId}:latency`, 0, 99)
        ])
        return {
            circuitState: circuitState || 'closed',
            consecutiveFailures: parseInt(failures as string || '0', 10),
            latencies: latencies.map(l => parseFloat(l as string))
        }
    }

    // =========================================================================
    // METRIC CALCULATORS
    // =========================================================================

    private calcAdjustedSuccessRate(requests: any[], activations: any[]): MetricValue {
        // Success rate adjusted for lifecycle-terminal states (not actual failures)
        const total = requests.length
        if (total === 0) return this.emptyMetric('Adjusted Success Rate', '%')

        const successful = requests.filter(r => r.success).length
        const lifecycleTerminal = activations.filter(a =>
            a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED'
        ).length

        const adjustedSuccess = (successful + lifecycleTerminal * 0.5) / total
        const value = Math.round(adjustedSuccess * 100 * 100) / 100

        return {
            value,
            unit: '%',
            status: this.rateStatus(value / 100, SLA.successRate),
            description: 'Success rate adjusted for natural lifecycle endings'
        }
    }

    private calcEffectiveCompletionRate(activations: any[]): MetricValue {
        // Orders that reached final successful state
        const total = activations.length
        if (total === 0) return this.emptyMetric('Effective Completion Rate', '%')

        const completed = activations.filter(a =>
            a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED'
        ).length

        const value = Math.round((completed / total) * 100 * 100) / 100
        return {
            value,
            unit: '%',
            status: this.rateStatus(value / 100, 0.90),
            description: 'Percentage of orders that successfully received SMS'
        }
    }

    private calcLateResolutionRatio(activations: any[]): MetricValue {
        // Orders completed after SLA deadline
        const completed = activations.filter(a =>
            a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED'
        )
        if (completed.length === 0) return this.emptyMetric('Late Resolution Ratio', '%')

        const late = completed.filter(a => {
            const duration = new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime()
            return duration > SLA.completionTimeMinutes * 60 * 1000
        }).length

        const value = Math.round((late / completed.length) * 100 * 100) / 100
        return {
            value,
            unit: '%',
            status: value < 5 ? 'excellent' : value < 15 ? 'good' : value < 30 ? 'warning' : 'critical',
            description: 'Completions that exceeded SLA time window'
        }
    }

    private calcStrictFailureRate(requests: any[]): MetricValue {
        // Hard failures only (excludes timeouts, no-stock)
        const total = requests.length
        if (total === 0) return this.emptyMetric('Strict Failure Rate', '%')

        const failures = requests.filter(r => !r.success).length
        const value = Math.round((failures / total) * 100 * 100) / 100

        return {
            value,
            unit: '%',
            status: value < 2 ? 'excellent' : value < 5 ? 'good' : value < 10 ? 'warning' : 'critical',
            description: 'Hard API failures (500s, timeouts, auth errors)'
        }
    }

    private calcSlaComplianceRate(requests: any[], activations: any[]): MetricValue {
        // Combined SLA: success + latency + completion time
        if (requests.length === 0) return this.emptyMetric('SLA Compliance Rate', '%')

        let compliant = 0
        for (const req of requests) {
            if (req.success && req.latency < SLA.latencyP95Ms) {
                compliant++
            }
        }

        const value = Math.round((compliant / requests.length) * 100 * 100) / 100
        return {
            value,
            unit: '%',
            status: this.rateStatus(value / 100, SLA.successRate),
            description: 'Requests meeting all SLA criteria'
        }
    }

    private calcReliabilityScore(requests: any[], health: any): MetricValue {
        // Composite score: success rate + stability + no circuit trips
        const successRate = requests.length > 0
            ? requests.filter(r => r.success).length / requests.length
            : 1

        const stabilityPenalty = health.consecutiveFailures * 0.05
        const circuitPenalty = health.circuitState === 'open' ? 0.3 : health.circuitState === 'half-open' ? 0.15 : 0

        const score = Math.max(0, (successRate - stabilityPenalty - circuitPenalty)) * 100
        const value = Math.round(score * 100) / 100

        return {
            value,
            unit: 'score',
            status: value > 90 ? 'excellent' : value > 75 ? 'good' : value > 50 ? 'warning' : 'critical',
            description: 'Composite reliability score (0-100)'
        }
    }

    private calcFirstAttemptSuccessRate(activations: any[]): MetricValue {
        // Orders that succeeded on first attempt (no retry needed)
        const withIdempotency = activations.filter(a => a.idempotencyKey)
        if (withIdempotency.length === 0) return this.emptyMetric('First-Attempt Success Rate', '%')

        // Group by idempotency key, count first attempts
        const grouped = new Map<string, any[]>()
        for (const a of withIdempotency) {
            const key = a.idempotencyKey
            if (!grouped.has(key)) grouped.set(key, [])
            grouped.get(key)!.push(a)
        }

        let firstSuccess = 0
        for (const attempts of grouped.values()) {
            attempts.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            if (attempts[0].state === 'COMPLETED' || attempts[0].state === 'SMS_RECEIVED' || attempts[0].state === 'ACTIVE') {
                firstSuccess++
            }
        }

        const value = Math.round((firstSuccess / grouped.size) * 100 * 100) / 100
        return {
            value,
            unit: '%',
            status: value > 85 ? 'excellent' : value > 70 ? 'good' : value > 50 ? 'warning' : 'critical',
            description: 'Success rate without needing retry'
        }
    }

    private calcRecoverySuccessRate(activations: any[]): MetricValue {
        // Orders that failed initially but eventually succeeded
        const failed = activations.filter(a => a.state === 'FAILED')
        if (failed.length === 0) return this.emptyMetric('Recovery Success Rate', '%', 100)

        // Check if same idempotency key has a success
        const failedKeys = new Set(failed.map(a => a.idempotencyKey).filter(Boolean))
        const recovered = activations.filter(a =>
            failedKeys.has(a.idempotencyKey) &&
            (a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED')
        ).length

        const value = Math.round((recovered / failedKeys.size) * 100 * 100) / 100
        return {
            value,
            unit: '%',
            status: value > 60 ? 'excellent' : value > 40 ? 'good' : value > 20 ? 'warning' : 'critical',
            description: 'Failed orders that were retried successfully'
        }
    }

    private calcPermanentFailureRatio(activations: any[]): MetricValue {
        const total = activations.length
        if (total === 0) return this.emptyMetric('Permanent Failure Ratio', '%')

        const permanent = activations.filter(a => a.state === 'FAILED').length
        const value = Math.round((permanent / total) * 100 * 100) / 100

        return {
            value,
            unit: '%',
            status: value < 2 ? 'excellent' : value < 5 ? 'good' : value < 10 ? 'warning' : 'critical',
            description: 'Orders that permanently failed (not recoverable)'
        }
    }

    private calcLatencyEfficiency(requests: any[]): MetricValue {
        if (requests.length === 0) return this.emptyMetric('Latency Efficiency', 'score')

        const latencies = requests.map(r => r.latency).filter((l: number) => l > 0)
        if (latencies.length === 0) return this.emptyMetric('Latency Efficiency', 'score')

        const avg = latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length
        const efficiency = Math.max(0, 100 - (avg / SLA.latencyP95Ms) * 100)
        const value = Math.round(efficiency * 100) / 100

        return {
            value,
            unit: 'score',
            status: value > 80 ? 'excellent' : value > 60 ? 'good' : value > 40 ? 'warning' : 'critical',
            description: 'How efficiently latency meets SLA (higher = faster)'
        }
    }

    private calcRetryImpactRatio(activations: any[]): MetricValue {
        // Impact of retries on success rate
        const withIdempotency = activations.filter(a => a.idempotencyKey)
        if (withIdempotency.length === 0) return this.emptyMetric('Retry Impact Ratio', 'x')

        const grouped = new Map<string, number>()
        for (const a of withIdempotency) {
            grouped.set(a.idempotencyKey, (grouped.get(a.idempotencyKey) || 0) + 1)
        }

        const retried = Array.from(grouped.values()).filter(count => count > 1).length
        const value = Math.round((retried / grouped.size) * 100) / 100

        return {
            value,
            unit: 'ratio',
            status: value < 0.1 ? 'excellent' : value < 0.2 ? 'good' : value < 0.35 ? 'warning' : 'critical',
            description: 'Proportion of orders requiring retry'
        }
    }

    private calcTimeoutBreachRate(activations: any[]): MetricValue {
        const total = activations.length
        if (total === 0) return this.emptyMetric('Timeout Breach Rate', '%')

        const expired = activations.filter(a => a.state === 'EXPIRED').length
        const value = Math.round((expired / total) * 100 * 100) / 100

        return {
            value,
            unit: '%',
            status: value < 5 ? 'excellent' : value < 15 ? 'good' : value < 30 ? 'warning' : 'critical',
            description: 'Orders that timed out waiting for SMS'
        }
    }

    private calcP95Compliance(requests: any[]): MetricValue {
        const latencies = requests.map(r => r.latency).filter((l: number) => l > 0).sort((a: number, b: number) => a - b)
        if (latencies.length === 0) return this.emptyMetric('p95 Latency Compliance', '%')

        const p95Index = Math.floor(latencies.length * 0.95)
        const p95 = latencies[p95Index] || latencies[latencies.length - 1]
        const compliant = p95 <= SLA.latencyP95Ms

        return {
            value: p95,
            unit: 'ms',
            status: compliant ? 'excellent' : p95 < SLA.latencyP95Ms * 1.5 ? 'warning' : 'critical',
            description: `p95 latency (SLA: ${SLA.latencyP95Ms}ms)`
        }
    }

    private calcP99Compliance(requests: any[]): MetricValue {
        const latencies = requests.map(r => r.latency).filter((l: number) => l > 0).sort((a: number, b: number) => a - b)
        if (latencies.length === 0) return this.emptyMetric('p99 Latency Compliance', '%')

        const p99Index = Math.floor(latencies.length * 0.99)
        const p99 = latencies[p99Index] || latencies[latencies.length - 1]
        const compliant = p99 <= SLA.latencyP99Ms

        return {
            value: p99,
            unit: 'ms',
            status: compliant ? 'excellent' : p99 < SLA.latencyP99Ms * 1.5 ? 'warning' : 'critical',
            description: `p99 latency (SLA: ${SLA.latencyP99Ms}ms)`
        }
    }

    private calcCountryStabilityIndex(activations: any[]): MetricValue {
        // Variance in success rates across countries
        if (activations.length === 0) return this.emptyMetric('Country Stability Index', 'score')

        const byCountry = new Map<string, { success: number, total: number }>()
        for (const a of activations) {
            const country = a.countryCode || 'unknown'
            if (!byCountry.has(country)) byCountry.set(country, { success: 0, total: 0 })
            byCountry.get(country)!.total++
            if (a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED') {
                byCountry.get(country)!.success++
            }
        }

        const rates = Array.from(byCountry.values()).map(c => c.success / c.total)
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length
        const variance = rates.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / rates.length
        const stability = Math.max(0, 100 - variance * 100)
        const value = Math.round(stability * 100) / 100

        return {
            value,
            unit: 'score',
            status: value > 90 ? 'excellent' : value > 75 ? 'good' : value > 50 ? 'warning' : 'critical',
            description: 'Consistency of success rates across countries'
        }
    }

    private calcRegionalDegradationIndex(activations: any[]): MetricValue {
        // Countries performing significantly worse than average
        if (activations.length === 0) return this.emptyMetric('Regional Degradation Index', '%')

        const byCountry = new Map<string, { success: number, total: number }>()
        for (const a of activations) {
            const country = a.countryCode || 'unknown'
            if (!byCountry.has(country)) byCountry.set(country, { success: 0, total: 0 })
            byCountry.get(country)!.total++
            if (a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED') {
                byCountry.get(country)!.success++
            }
        }

        const rates = Array.from(byCountry.values()).map(c => c.success / c.total)
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length
        const degraded = rates.filter(r => r < avg - 0.2).length // 20% below average

        const value = Math.round((degraded / rates.length) * 100 * 100) / 100
        return {
            value,
            unit: '%',
            status: value < 10 ? 'excellent' : value < 25 ? 'good' : value < 40 ? 'warning' : 'critical',
            description: 'Countries performing >20% below average'
        }
    }

    private calcOperationalIntegrity(requests: any[], health: any): MetricValue {
        // Overall system health score
        const successRate = requests.length > 0
            ? requests.filter(r => r.success).length / requests.length
            : 1

        const circuitHealthy = health.circuitState === 'closed' ? 1 : 0.5
        const score = successRate * 0.6 + circuitHealthy * 0.4
        const value = Math.round(score * 100 * 100) / 100

        return {
            value,
            unit: 'score',
            status: value > 90 ? 'excellent' : value > 75 ? 'good' : value > 50 ? 'warning' : 'critical',
            description: 'Overall operational health composite'
        }
    }

    private async calcWorkerFailureRate(): Promise<MetricValue> {
        // Failed background jobs ratio
        try {
            const failed = await redis.llen('bull:sms-poller:failed') || 0
            const completed = await redis.llen('bull:sms-poller:completed') || 1
            const value = Math.round((failed / (failed + completed)) * 100 * 100) / 100

            return {
                value,
                unit: '%',
                status: value < 1 ? 'excellent' : value < 5 ? 'good' : value < 15 ? 'warning' : 'critical',
                description: 'Background worker job failure rate'
            }
        } catch {
            return this.emptyMetric('Worker Failure Rate', '%')
        }
    }

    private async calcQueueSaturation(): Promise<MetricValue> {
        // Queue depth relative to capacity
        try {
            const waiting = await redis.llen('bull:sms-poller:wait') || 0
            const active = await redis.llen('bull:sms-poller:active') || 0
            const maxCapacity = 1000 // Configurable
            const value = Math.round(((waiting + active) / maxCapacity) * 100 * 100) / 100

            return {
                value,
                unit: '%',
                status: value < 50 ? 'excellent' : value < 75 ? 'good' : value < 90 ? 'warning' : 'critical',
                description: 'Queue utilization vs capacity'
            }
        } catch {
            return this.emptyMetric('Queue Saturation Ratio', '%')
        }
    }

    private calcIdempotencyViolations(activations: any[]): MetricValue {
        // Duplicate processing attempts
        const withIdempotency = activations.filter(a => a.idempotencyKey)
        if (withIdempotency.length === 0) return this.emptyMetric('Idempotency Violation Rate', '%')

        const counts = new Map<string, number>()
        for (const a of withIdempotency) {
            counts.set(a.idempotencyKey, (counts.get(a.idempotencyKey) || 0) + 1)
        }

        const violations = Array.from(counts.values()).filter(c => c > 1).length
        const value = Math.round((violations / counts.size) * 100 * 100) / 100

        return {
            value,
            unit: '%',
            status: value < 1 ? 'excellent' : value < 5 ? 'good' : value < 10 ? 'warning' : 'critical',
            description: 'Duplicate processing attempts detected'
        }
    }

    private calcAvailabilityRate(health: any): MetricValue {
        // Provider uptime
        const available = health.circuitState === 'closed' || health.circuitState === 'half-open'
        const value = available ? 100 : 0

        return {
            value,
            unit: '%',
            status: available ? 'excellent' : 'critical',
            description: 'Provider circuit breaker availability'
        }
    }

    private calcCallbackCompletion(activations: any[]): MetricValue {
        // Activations that received callback/SMS
        const total = activations.length
        if (total === 0) return this.emptyMetric('Callback Completion Rate', '%')

        const withSms = activations.filter(a =>
            a.state === 'SMS_RECEIVED' || a.state === 'COMPLETED'
        ).length

        const value = Math.round((withSms / total) * 100 * 100) / 100
        return {
            value,
            unit: '%',
            status: value > 80 ? 'excellent' : value > 60 ? 'good' : value > 40 ? 'warning' : 'critical',
            description: 'Activations that successfully received SMS callback'
        }
    }

    private calcCostPerSuccess(transactions: any[], activations: any[]): MetricValue {
        const successfulActivations = activations.filter(a =>
            a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED'
        )
        const successful = successfulActivations.length

        if (successful === 0) return this.emptyMetric('Cost per Successful Operation', '$')

        const totalCost = successfulActivations.reduce((sum, a) => {
            const cost = Number(a.providerCost || 0)
            return sum + cost
        }, 0)

        const value = Math.round((totalCost / successful) * 100) / 100
        return {
            value,
            unit: '$',
            status: 'good',
            description: 'Average provider cost per successful order'
        }
    }

    private calcRevenuePerSuccess(transactions: any[], activations: any[]): MetricValue {
        const successful = activations.filter(a =>
            a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED'
        ).length

        if (successful === 0) return this.emptyMetric('Revenue per Successful Operation', '$')

        // Revenue = user payment (with markup)
        const totalRevenue = activations
            .filter(a => a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED')
            .reduce((sum, a) => sum + Number(a.price || 0), 0)

        const value = Math.round((totalRevenue / successful) * 100) / 100
        return {
            value,
            unit: '$',
            status: 'good',
            description: 'Average revenue per successful order'
        }
    }

    private calcMarginPerService(transactions: any[], activations: any[]): MetricValue {
        const successfulActivations = activations.filter(a =>
            a.state === 'COMPLETED' || a.state === 'SMS_RECEIVED'
        )

        const revenue = successfulActivations.reduce((sum, a) => sum + Number(a.price || 0), 0)

        // Calculate cost using source-of-truth providerCost field
        const cost = successfulActivations.reduce((sum, a) => {
            const pCost = Number(a.providerCost || 0)
            if (pCost > 0) return sum + pCost

            // Legacy fallback
            return sum + (Number(a.price || 0) * 0.7)
        }, 0)

        if (revenue === 0) return this.emptyMetric('Margin per Service', '%')

        const margin = ((revenue - cost) / revenue) * 100
        const value = Math.round(margin * 100) / 100

        return {
            value,
            unit: '%',
            status: value > 30 ? 'excellent' : value > 20 ? 'good' : value > 10 ? 'warning' : 'critical',
            description: 'Net profit margin per service'
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private emptyMetric(name: string, unit: string, defaultValue: number = 0): MetricValue {
        return {
            value: defaultValue,
            unit,
            status: 'good',
            description: `${name} (no data)`
        }
    }

    private rateStatus(rate: number, threshold: number): 'excellent' | 'good' | 'warning' | 'critical' {
        if (rate >= threshold) return 'excellent'
        if (rate >= threshold * 0.9) return 'good'
        if (rate >= threshold * 0.7) return 'warning'
        return 'critical'
    }

    private calculateAggregate(providers: ProviderMetrics[]) {
        if (providers.length === 0) {
            return {
                overallHealthScore: this.emptyMetric('Overall Health Score', 'score'),
                platformSlaCompliance: this.emptyMetric('Platform SLA Compliance', '%'),
                totalTransactions: 0,
                totalRevenue: 0,
                avgMargin: 0
            }
        }

        const avgReliability = providers.reduce((s, p) => s + p.providerReliabilityScore.value, 0) / providers.length
        const avgSla = providers.reduce((s, p) => s + p.slaComplianceRate.value, 0) / providers.length
        const avgMargin = providers.reduce((s, p) => s + p.marginPerService.value, 0) / providers.length

        return {
            overallHealthScore: {
                value: Math.round(avgReliability * 100) / 100,
                unit: 'score',
                status: avgReliability > 90 ? 'excellent' : avgReliability > 75 ? 'good' : avgReliability > 50 ? 'warning' : 'critical' as any,
                description: 'Average reliability across all providers'
            },
            platformSlaCompliance: {
                value: Math.round(avgSla * 100) / 100,
                unit: '%',
                status: avgSla > 95 ? 'excellent' : avgSla > 90 ? 'good' : avgSla > 80 ? 'warning' : 'critical' as any,
                description: 'Platform-wide SLA compliance'
            },
            totalTransactions: providers.length * 100, // Placeholder
            totalRevenue: providers.reduce((s, p) => s + p.revenuePerSuccessfulOperation.value * 100, 0),
            avgMargin: Math.round(avgMargin * 100) / 100
        }
    }
}

// Singleton
export const metricsCalculator = new AdvancedMetricsCalculator()
