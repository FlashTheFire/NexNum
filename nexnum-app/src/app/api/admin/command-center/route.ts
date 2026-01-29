import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { AuthGuard } from '@/lib/auth/guard'
import { registry } from '@/lib/metrics'
import { withMetrics } from '@/lib/monitoring/http-metrics'
import { updateActiveNumbers, updateWorkerQueue, updateHardwareStats, updateDbConnections } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

// ============================================================================
// TYPES
// ============================================================================

interface CommandCenterData {
    timestamp: string
    systemStatus: 'healthy' | 'degraded' | 'critical'
    kpis: {
        rps: number
        errorRate: number
        p99Latency: number
        activeRentals: number
        walletShortfalls: number
    }
    incidents: {
        id: string
        title: string
        severity: 'critical' | 'warning' | 'info'
        timestamp: string
        affectedSystem?: string
        description?: string
    }[]
    recentActivity: {
        id: string
        type: string
        description: string
        timestamp: string
    }[]
}

// ============================================================================
// ENDPOINT
// ============================================================================

/**
 * GET /api/admin/command-center
 * 
 * Returns aggregated data for the Admin Command Center dashboard.
 * Includes system status, KPIs, active incidents, and recent activity.
 */
export async function GET(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        // Collect all data in parallel
        const [
            systemStatus,
            kpis,
            incidents,
            recentActivity
        ] = await Promise.all([
            getSystemStatus(),
            getKPIs(),
            getActiveIncidents(),
            getRecentActivity()
        ])

        const response: CommandCenterData = {
            timestamp: new Date().toISOString(),
            systemStatus,
            kpis,
            incidents,
            recentActivity
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error('Command Center API error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch command center data' },
            { status: 500 }
        )
    }
}

// ============================================================================
// DATA FETCHERS
// ============================================================================

async function getSystemStatus(): Promise<'healthy' | 'degraded' | 'critical'> {
    try {
        // Quick health checks
        const [dbOk, redisOk] = await Promise.all([
            prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
            redis.ping().then(() => true).catch(() => false)
        ])

        // Check for failed jobs
        const failedJobs = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM pgboss.job WHERE state = 'failed'
        `.catch(() => [{ count: BigInt(0) }])

        const failedCount = Number(failedJobs[0]?.count || 0)

        // Check for provider issues
        const providerIssues = await prisma.provider.count({
            where: {
                isActive: true,
                syncStatus: 'failed'
            }
        })

        if (!dbOk || !redisOk) return 'critical'
        if (failedCount > 50 || providerIssues > 0) return 'degraded'
        return 'healthy'
    } catch {
        return 'critical'
    }
}

async function getKPIs(): Promise<CommandCenterData['kpis']> {
    try {
        // Get active rentals
        const activeRentals = await prisma.number.count({
            where: {
                status: { in: ['PENDING', 'ACTIVE'] }
            }
        })

        // Get wallet shortfalls (users with negative or very low balance)
        // Using raw query since balance is on Wallet model, not User
        const shortfallsResult = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM "wallets" WHERE balance < 0
        `.catch(() => [{ count: BigInt(0) }])
        const walletShortfalls = Number(shortfallsResult[0]?.count || 0)

        // Calculate RPS from metrics (if available)
        // For now, use a placeholder or calculate from recent requests
        const rpsKey = 'metrics:rps:current'
        const cachedRps = await redis.get(rpsKey).catch(() => null)
        const rps = cachedRps ? parseFloat(cachedRps) : 0

        // Get error rate from recent logs
        const errorRateKey = 'metrics:error_rate:current'
        const cachedErrorRate = await redis.get(errorRateKey).catch(() => null)
        const errorRate = cachedErrorRate ? parseFloat(cachedErrorRate) : 0

        // Get p99 latency
        const p99Key = 'metrics:p99_latency:current'
        const cachedP99 = await redis.get(p99Key).catch(() => null)
        const p99Latency = cachedP99 ? parseFloat(cachedP99) : 0

        // UPDATE PROMETHEUS METRICS
        updateActiveNumbers(activeRentals)

        // Update worker queue depth
        // Query job stats (similar to /api/admin/jobs/retry logic)
        // We do this inside getKPIs so it runs on dashboard refresh
        const jobStats = await prisma.$queryRaw<{ state: string, count: bigint }[]>`
            SELECT state, COUNT(*) as count 
            FROM pgboss.job 
            WHERE state IN ('created', 'active', 'failed')
            GROUP BY state
        `.catch(() => [])

        const getJobCount = (state: string) => Number(jobStats.find(s => s.state === state)?.count || 0)
        updateWorkerQueue('default', getJobCount('created'), getJobCount('active'), getJobCount('failed'))

        // Update System Metrics
        updateHardwareStats(0)

        // Update DB Connections
        // Try to get metrics from Prisma if available, otherwise estimate or skip
        // Note: Prisma metrics need to be enabled in preview features
        // For now, we'll try to get a basic count using pg_stat_activity if possible, 
        // or just Mock it if strict query isn't allowed. 
        // Actually, let's rely on the system status check we already do
        try {
            const dbStats = await prisma.$queryRaw<{ count: bigint, state: string }[]>`
                SELECT state, count(*) as count 
                FROM pg_stat_activity 
                WHERE datname = current_database() 
                GROUP BY state
            `.catch(() => [])

            let active = 0
            let idle = 0
            dbStats.forEach(s => {
                if (s.state === 'active') active += Number(s.count)
                if (s.state === 'idle') idle += Number(s.count)
            })
            // Assumed max is from env or default
            updateDbConnections(active, idle, 20)
        } catch (e) {
            // Ignore if permission denied
        }

        return {
            rps: Math.round(rps * 100) / 100,
            errorRate: Math.round(errorRate * 1000) / 1000,
            p99Latency: Math.round(p99Latency),
            activeRentals,
            walletShortfalls
        }
    } catch (error) {
        console.error('Error fetching KPIs:', error)
        return {
            rps: 0,
            errorRate: 0,
            p99Latency: 0,
            activeRentals: 0,
            walletShortfalls: 0
        }
    }
}

async function getActiveIncidents(): Promise<CommandCenterData['incidents']> {
    try {
        // Check for incidents stored in Redis
        const incidentsKey = 'admin:incidents:active'
        const storedIncidents = await redis.lrange(incidentsKey, 0, 9).catch(() => [])

        const incidents: CommandCenterData['incidents'] = []

        // Parse stored incidents
        for (const item of storedIncidents) {
            try {
                incidents.push(JSON.parse(item))
            } catch {
                // Skip malformed entries
            }
        }

        // Auto-detect incidents from system state

        // Check for failed jobs
        const failedJobs = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM pgboss.job WHERE state = 'failed'
        `.catch(() => [{ count: BigInt(0) }])

        const failedCount = Number(failedJobs[0]?.count || 0)
        if (failedCount > 10) {
            incidents.push({
                id: 'auto-failed-jobs',
                title: `${failedCount} Failed Background Jobs`,
                severity: failedCount > 50 ? 'critical' : 'warning',
                timestamp: new Date().toISOString(),
                affectedSystem: 'Worker Queue',
                description: 'Multiple background jobs have failed and may require attention'
            })
        }

        // Check for provider failures
        const failedProviders = await prisma.provider.findMany({
            where: {
                isActive: true,
                syncStatus: 'failed'
            },
            select: { name: true, displayName: true }
        })

        for (const provider of failedProviders) {
            incidents.push({
                id: `auto-provider-${provider.name}`,
                title: `Provider ${provider.displayName} Failed`,
                severity: 'warning',
                timestamp: new Date().toISOString(),
                affectedSystem: 'Providers',
                description: `Sync failed for provider ${provider.displayName}`
            })
        }

        // Sort by severity and timestamp
        return incidents
            .sort((a, b) => {
                const severityOrder = { critical: 0, warning: 1, info: 2 }
                return severityOrder[a.severity] - severityOrder[b.severity]
            })
            .slice(0, 5)
    } catch (error) {
        console.error('Error fetching incidents:', error)
        return []
    }
}

async function getRecentActivity(): Promise<CommandCenterData['recentActivity']> {
    try {
        // Get recent admin API logs from Redis
        const logsKey = 'admin:api_logs'
        const recentLogs = await redis.lrange(logsKey, 0, 9).catch(() => [])

        return recentLogs.map((log, index) => {
            try {
                const parsed = JSON.parse(log)
                return {
                    id: parsed.id || `log-${index}`,
                    type: parsed.method || 'API',
                    description: `${parsed.method} ${parsed.path}`,
                    timestamp: parsed.timestamp
                }
            } catch {
                return null
            }
        }).filter(Boolean) as CommandCenterData['recentActivity']
    } catch {
        return []
    }
}
