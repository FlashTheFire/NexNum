import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { meili, INDEXES } from '@/lib/search/search'
import { AuthGuard } from '@/lib/auth/guard'
import os from 'os'

export const dynamic = 'force-dynamic'

// ============================================================================
// TYPES
// ============================================================================

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

interface DependencyCheck {
    status: HealthStatus
    latencyMs: number
    timestamp: string
    message?: string
    remediation?: string
    details?: Record<string, any>
}

interface DetailedHealthResponse {
    timestamp: string
    overall: HealthStatus
    uptime: number
    version: string
    environment: string
    dependencies: {
        database: DependencyCheck & {
            migrationVersion?: string
            poolUtilization?: number
            activeConnections?: number
            maxConnections?: number
        }
        redis: DependencyCheck & {
            connected: boolean
            memoryUsed?: string
            keyCount?: number
            opsPerSec?: number
        }
        search: DependencyCheck & {
            indexName: string
            documentCount?: number
            isIndexing?: boolean
        }
        queue: DependencyCheck & {
            depth: number
            backlog: number
            processing: number
            failed: number
        }
        disk: DependencyCheck & {
            totalGB: number
            freeGB: number
            usedPercent: number
        }
        providers: {
            name: string
            status: HealthStatus
            lastPing?: string
            remediation?: string
        }[]
        jobs: {
            name: string
            lastRun?: string
            status: HealthStatus
            remediation?: string
        }[]
    }
}

// ============================================================================
// ENDPOINT
// ============================================================================

/**
 * GET /api/health/detailed
 * 
 * Comprehensive health check endpoint for admin monitoring.
 * Requires admin authentication.
 * 
 * Returns detailed status of all system dependencies with:
 * - Individual latency measurements
 * - Status per subsystem
 * - Remediation hints for issues
 * - Pool/connection utilization
 */
export async function GET(request: Request) {
    // Require admin authentication
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const startTime = Date.now()
    const timestamp = new Date().toISOString()

    // Run all checks in parallel
    const [
        databaseCheck,
        redisCheck,
        searchCheck,
        queueCheck,
        diskCheck,
        providerChecks,
        jobChecks
    ] = await Promise.all([
        checkDatabase(),
        checkRedis(),
        checkSearch(),
        checkQueue(),
        checkDisk(),
        checkProviders(),
        checkCriticalJobs()
    ])

    // Derive overall status
    const allChecks = [databaseCheck, redisCheck, searchCheck, queueCheck, diskCheck]
    const overall = deriveOverallStatus(allChecks)

    const response: DetailedHealthResponse = {
        timestamp,
        overall,
        uptime: Math.floor(process.uptime()),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        dependencies: {
            database: databaseCheck,
            redis: redisCheck,
            search: searchCheck,
            queue: queueCheck,
            disk: diskCheck,
            providers: providerChecks,
            jobs: jobChecks
        }
    }

    // Set appropriate HTTP status based on health
    const httpStatus = overall === 'healthy' ? 200 : overall === 'degraded' ? 200 : 503

    return NextResponse.json(response, {
        status: httpStatus,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Health-Check-Duration': `${Date.now() - startTime}ms`
        }
    })
}

// ============================================================================
// DEPENDENCY CHECKS
// ============================================================================

async function checkDatabase(): Promise<DependencyCheck & {
    migrationVersion?: string
    poolUtilization?: number
    activeConnections?: number
    maxConnections?: number
}> {
    const start = Date.now()
    const timestamp = new Date().toISOString()

    try {
        // Basic connectivity check
        await prisma.$queryRaw`SELECT 1`

        // Get connection pool stats
        const maxConnections = process.env.NODE_ENV === 'development' ? 5 : 10
        const stats = await prisma.$queryRaw<{ active: bigint; idle: bigint }[]>`
            SELECT 
                COUNT(*) FILTER (WHERE state = 'active') as active,
                COUNT(*) FILTER (WHERE state = 'idle') as idle
            FROM pg_stat_activity 
            WHERE datname = current_database()
        `.catch(() => [{ active: BigInt(0), idle: BigInt(0) }])

        const active = Number(stats[0]?.active || 0)
        const utilization = Math.round((active / maxConnections) * 100)

        // Get migration version (optional)
        let migrationVersion: string | undefined
        try {
            const migrations = await prisma.$queryRaw<{ migration_name: string }[]>`
                SELECT migration_name FROM _prisma_migrations 
                ORDER BY finished_at DESC LIMIT 1
            `
            migrationVersion = migrations[0]?.migration_name
        } catch {
            // Migration table may not exist
        }

        return {
            status: utilization > 90 ? 'unhealthy' : utilization > 70 ? 'degraded' : 'healthy',
            latencyMs: Date.now() - start,
            timestamp,
            migrationVersion,
            poolUtilization: utilization,
            activeConnections: active,
            maxConnections,
            message: utilization > 70 ? 'High connection pool usage' : 'Database operational',
            remediation: utilization > 90 ? 'Scale database or check for connection leaks' : undefined
        }
    } catch (error: any) {
        return {
            status: 'unhealthy',
            latencyMs: Date.now() - start,
            timestamp,
            message: `Database unreachable: ${error.message}`,
            remediation: 'Check DATABASE_URL and network connectivity'
        }
    }
}

async function checkRedis(): Promise<DependencyCheck & {
    connected: boolean
    memoryUsed?: string
    keyCount?: number
    opsPerSec?: number
}> {
    const start = Date.now()
    const timestamp = new Date().toISOString()

    try {
        await redis.ping()

        // Get Redis info
        const info = await redis.info()
        const lines = info.split('\r\n')

        const getValue = (key: string): string => {
            const line = lines.find(l => l.startsWith(`${key}:`))
            return line?.split(':')[1] || '0'
        }

        const memoryUsed = getValue('used_memory_human')
        const keyCount = parseInt(getValue('db0')?.match(/keys=(\d+)/)?.[1] || '0')
        const opsPerSec = parseInt(getValue('instantaneous_ops_per_sec'))

        return {
            status: 'healthy',
            latencyMs: Date.now() - start,
            timestamp,
            connected: true,
            memoryUsed,
            keyCount,
            opsPerSec,
            message: 'Redis operational'
        }
    } catch (error: any) {
        return {
            status: 'unhealthy',
            latencyMs: Date.now() - start,
            timestamp,
            connected: false,
            message: `Redis unreachable: ${error.message}`,
            remediation: 'Check REDIS_URL and ensure Redis container is running'
        }
    }
}

async function checkSearch(): Promise<DependencyCheck & {
    indexName: string
    documentCount?: number
    isIndexing?: boolean
}> {
    const start = Date.now()
    const timestamp = new Date().toISOString()
    const indexName = INDEXES.OFFERS

    try {
        const health = await meili.health()

        if (health.status !== 'available') {
            return {
                status: 'degraded',
                latencyMs: Date.now() - start,
                timestamp,
                indexName,
                message: `MeiliSearch status: ${health.status}`,
                remediation: 'Check MeiliSearch logs for issues'
            }
        }

        const index = meili.index(indexName)
        const stats = await index.getStats()

        return {
            status: 'healthy',
            latencyMs: Date.now() - start,
            timestamp,
            indexName,
            documentCount: stats.numberOfDocuments,
            isIndexing: stats.isIndexing,
            message: stats.isIndexing ? 'Indexing in progress' : 'Search operational'
        }
    } catch (error: any) {
        return {
            status: 'unhealthy',
            latencyMs: Date.now() - start,
            timestamp,
            indexName,
            message: `MeiliSearch unreachable: ${error.message}`,
            remediation: 'Check MEILI_HOST and ensure MeiliSearch container is running'
        }
    }
}

async function checkQueue(): Promise<DependencyCheck & {
    depth: number
    backlog: number
    processing: number
    failed: number
}> {
    const start = Date.now()
    const timestamp = new Date().toISOString()

    try {
        // Query pg-boss tables
        const [pending, active, failed] = await Promise.all([
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count FROM pgboss.job WHERE state = 'created'
            `.catch(() => [{ count: BigInt(0) }]),
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count FROM pgboss.job WHERE state = 'active'
            `.catch(() => [{ count: BigInt(0) }]),
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count FROM pgboss.job WHERE state = 'failed'
            `.catch(() => [{ count: BigInt(0) }])
        ])

        const depth = Number(pending[0]?.count || 0)
        const processing = Number(active[0]?.count || 0)
        const failedCount = Number(failed[0]?.count || 0)

        const status: HealthStatus =
            failedCount > 100 ? 'unhealthy' :
                failedCount > 10 || depth > 1000 ? 'degraded' :
                    'healthy'

        return {
            status,
            latencyMs: Date.now() - start,
            timestamp,
            depth,
            backlog: depth,
            processing,
            failed: failedCount,
            message: failedCount > 0 ? `${failedCount} failed jobs` : 'Queue operational',
            remediation: failedCount > 10 ? 'Review and retry failed jobs in admin panel' : undefined
        }
    } catch (error: any) {
        // pg-boss tables may not exist
        return {
            status: 'healthy',
            latencyMs: Date.now() - start,
            timestamp,
            depth: 0,
            backlog: 0,
            processing: 0,
            failed: 0,
            message: 'Queue status unknown (pg-boss not initialized)'
        }
    }
}

async function checkDisk(): Promise<DependencyCheck & {
    totalGB: number
    freeGB: number
    usedPercent: number
}> {
    const start = Date.now()
    const timestamp = new Date().toISOString()

    try {
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        const usedMem = totalMem - freeMem
        const usedPercent = Math.round((usedMem / totalMem) * 100)

        // Note: This checks memory, not disk. For actual disk stats,
        // you'd need node-disk-info or similar package
        const status: HealthStatus =
            usedPercent > 95 ? 'unhealthy' :
                usedPercent > 85 ? 'degraded' :
                    'healthy'

        return {
            status,
            latencyMs: Date.now() - start,
            timestamp,
            totalGB: Math.round(totalMem / (1024 * 1024 * 1024) * 100) / 100,
            freeGB: Math.round(freeMem / (1024 * 1024 * 1024) * 100) / 100,
            usedPercent,
            message: usedPercent > 85 ? 'High memory usage' : 'Memory usage normal',
            remediation: usedPercent > 95 ? 'Consider scaling up or checking for memory leaks' : undefined,
            details: {
                note: 'This measures system memory. For disk space, deploy with monitoring agent.'
            }
        }
    } catch (error: any) {
        return {
            status: 'healthy',
            latencyMs: Date.now() - start,
            timestamp,
            totalGB: 0,
            freeGB: 0,
            usedPercent: 0,
            message: 'Unable to get system memory stats'
        }
    }
}

async function checkProviders(): Promise<{
    name: string
    status: HealthStatus
    lastPing?: string
    remediation?: string
}[]> {
    try {
        const providers = await prisma.provider.findMany({
            where: { isActive: true },
            select: {
                name: true,
                displayName: true,
                syncStatus: true,
                lastSyncAt: true
            }
        })

        return providers.map(p => ({
            name: p.displayName || p.name,
            status: p.syncStatus === 'success' ? 'healthy' :
                p.syncStatus === 'syncing' ? 'degraded' : 'unhealthy',
            lastPing: p.lastSyncAt?.toISOString(),
            remediation: p.syncStatus === 'failed' ?
                `Check provider ${p.name} credentials and connectivity` : undefined
        }))
    } catch {
        return []
    }
}

async function checkCriticalJobs(): Promise<{
    name: string
    lastRun?: string
    status: HealthStatus
    remediation?: string
}[]> {
    // Define critical background jobs to monitor
    const criticalJobs = [
        { name: 'Provider Sync', maxAgeHours: 24 },
        { name: 'Inbox Polling', maxAgeHours: 1 },
        { name: 'Cleanup Tasks', maxAgeHours: 24 }
    ]

    try {
        // Get last completed jobs from pg-boss
        const recentJobs = await prisma.$queryRaw<{ name: string; completedon: Date }[]>`
            SELECT name, completedon 
            FROM pgboss.job 
            WHERE state = 'completed' 
            AND completedon > NOW() - INTERVAL '24 hours'
            ORDER BY completedon DESC
        `.catch(() => [])

        return criticalJobs.map(job => {
            const lastRun = recentJobs.find(j =>
                j.name.toLowerCase().includes(job.name.toLowerCase().replace(' ', ''))
            )

            const isStale = !lastRun ||
                (Date.now() - new Date(lastRun.completedon).getTime()) > job.maxAgeHours * 60 * 60 * 1000

            return {
                name: job.name,
                lastRun: lastRun?.completedon.toISOString(),
                status: isStale ? 'degraded' : 'healthy',
                remediation: isStale ? `Job "${job.name}" hasn't run in ${job.maxAgeHours}h` : undefined
            }
        })
    } catch {
        return criticalJobs.map(job => ({
            name: job.name,
            status: 'healthy' as HealthStatus,
            remediation: undefined
        }))
    }
}

// ============================================================================
// HELPERS
// ============================================================================

function deriveOverallStatus(checks: DependencyCheck[]): HealthStatus {
    const hasUnhealthy = checks.some(c => c.status === 'unhealthy')
    const hasDegraded = checks.some(c => c.status === 'degraded')

    if (hasUnhealthy) return 'unhealthy'
    if (hasDegraded) return 'degraded'
    return 'healthy'
}

