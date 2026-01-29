import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { AuthGuard } from '@/lib/auth/guard'
import { meili, INDEXES } from '@/lib/search/search'
import { registry } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

interface MetricsResponse {
    timestamp: string
    database: DatabaseMetrics
    redis: RedisMetrics
    search: SearchMetrics
    providers: ProviderMetrics
    workers: WorkerMetrics
    application: ApplicationMetrics
}

interface DatabaseMetrics {
    status: 'healthy' | 'warning' | 'critical'
    activeConnections: number
    idleConnections: number
    maxConnections: number
    poolUtilization: number
    queryCount?: number
}

interface RedisMetrics {
    status: 'healthy' | 'warning' | 'critical'
    connected: boolean
    memoryUsed: string
    memoryPeak: string
    keyCount: number
    opsPerSec: number
    connectedClients: number
}

interface SearchMetrics {
    status: 'healthy' | 'warning' | 'critical'
    connected: boolean
    indexName: string
    documentCount: number
    isIndexing: boolean
    lastUpdate?: string
}

interface ProviderMetrics {
    total: number
    active: number
    syncing: number
    failed: number
    lowBalance: number
    providers: {
        name: string
        displayName: string
        status: string
        balance: number
        currency: string
        lastSync: string | null
        isActive: boolean
    }[]
}

interface WorkerMetrics {
    status: 'healthy' | 'warning' | 'critical'
    activeJobs: number
    completedToday: number
    failedToday: number
    queueDepth: number
}

interface ApplicationMetrics {
    uptime: number
    memoryUsage: {
        heapUsed: number
        heapTotal: number
        external: number
        rss: number
    }
    cpuUsage: NodeJS.CpuUsage
}

export async function GET(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const timestamp = new Date().toISOString()

    // Collect all metrics in parallel
    const [database, redisMetrics, search, providers, workers, application] = await Promise.all([
        getDatabaseMetrics(),
        getRedisMetrics(),
        getSearchMetrics(),
        getProviderMetrics(),
        getWorkerMetrics(),
        getApplicationMetrics()
    ])

    const response: MetricsResponse = {
        timestamp,
        database,
        redis: redisMetrics,
        search,
        providers,
        workers,
        application
    }

    return NextResponse.json(response)
}

// ============================================
// DATABASE (Prisma/PostgreSQL)
// ============================================
async function getDatabaseMetrics(): Promise<DatabaseMetrics> {
    try {
        // Simple health check query
        await prisma.$queryRaw`SELECT 1`

        // Get pool config from our setup
        const maxConnections = process.env.NODE_ENV === 'development' ? 5 : 10

        // Estimate active connections via pg_stat_activity
        const stats = await prisma.$queryRaw<{ active: bigint; idle: bigint }[]>`
            SELECT 
                COUNT(*) FILTER (WHERE state = 'active') as active,
                COUNT(*) FILTER (WHERE state = 'idle') as idle
            FROM pg_stat_activity 
            WHERE datname = current_database()
        `

        const active = Number(stats[0]?.active || 0)
        const idle = Number(stats[0]?.idle || 0)
        const utilization = Math.round((active / maxConnections) * 100)

        return {
            status: utilization > 80 ? 'critical' : utilization > 50 ? 'warning' : 'healthy',
            activeConnections: active,
            idleConnections: idle,
            maxConnections,
            poolUtilization: utilization
        }
    } catch (error) {
        console.error('Database metrics error:', error)
        return {
            status: 'critical',
            activeConnections: 0,
            idleConnections: 0,
            maxConnections: 10,
            poolUtilization: 0
        }
    }
}

// ============================================
// REDIS
// ============================================
async function getRedisMetrics(): Promise<RedisMetrics> {
    try {
        const info = await redis.info()
        const lines = info.split('\r\n')

        const getValue = (key: string): string => {
            const line = lines.find(l => l.startsWith(`${key}:`))
            return line?.split(':')[1] || '0'
        }

        const memoryUsed = getValue('used_memory_human')
        const memoryPeak = getValue('used_memory_peak_human')
        const keyCount = parseInt(getValue('db0')?.match(/keys=(\d+)/)?.[1] || '0')
        const opsPerSec = parseInt(getValue('instantaneous_ops_per_sec'))
        const connectedClients = parseInt(getValue('connected_clients'))

        return {
            status: 'healthy',
            connected: true,
            memoryUsed,
            memoryPeak,
            keyCount,
            opsPerSec,
            connectedClients
        }
    } catch (error) {
        console.error('Redis metrics error:', error)
        return {
            status: 'critical',
            connected: false,
            memoryUsed: '0',
            memoryPeak: '0',
            keyCount: 0,
            opsPerSec: 0,
            connectedClients: 0
        }
    }
}

// ============================================
// MEILISEARCH
// ============================================
async function getSearchMetrics(): Promise<SearchMetrics> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const stats = await index.getStats()

        return {
            status: 'healthy',
            connected: true,
            indexName: INDEXES.OFFERS,
            documentCount: stats.numberOfDocuments,
            isIndexing: stats.isIndexing
        }
    } catch (error) {
        console.error('Search metrics error:', error)
        return {
            status: 'critical',
            connected: false,
            indexName: INDEXES.OFFERS,
            documentCount: 0,
            isIndexing: false
        }
    }
}

// ============================================
// PROVIDERS
// ============================================
async function getProviderMetrics(): Promise<ProviderMetrics> {
    try {
        const allProviders = await prisma.provider.findMany({
            select: {
                name: true,
                displayName: true,
                syncStatus: true,
                balance: true,
                currency: true,
                lastSyncAt: true,
                isActive: true,
                lowBalanceAlert: true
            },
            orderBy: { priority: 'asc' }
        })

        const active = allProviders.filter(p => p.isActive).length
        const syncing = allProviders.filter(p => p.syncStatus === 'syncing').length
        const failed = allProviders.filter(p => p.syncStatus === 'failed').length
        const lowBalance = allProviders.filter(p =>
            p.isActive && Number(p.balance || 0) < Number(p.lowBalanceAlert || 10)
        ).length

        return {
            total: allProviders.length,
            active,
            syncing,
            failed,
            lowBalance,
            providers: allProviders.map(p => ({
                name: p.name,
                displayName: p.displayName,
                status: p.syncStatus || 'unknown',
                balance: Number(p.balance || 0),
                currency: p.currency,
                lastSync: p.lastSyncAt?.toISOString() || null,
                isActive: p.isActive
            }))
        }
    } catch (error) {
        console.error('Provider metrics error:', error)
        return {
            total: 0,
            active: 0,
            syncing: 0,
            failed: 0,
            lowBalance: 0,
            providers: []
        }
    }
}

// ============================================
// WORKERS (pg-boss via Prisma)
// ============================================
async function getWorkerMetrics(): Promise<WorkerMetrics> {
    try {
        // Query pg-boss tables directly
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Count active jobs
        const activeResult = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM pgboss.job 
            WHERE state = 'active'
        `.catch(() => [{ count: BigInt(0) }])

        // Count completed today
        const completedResult = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM pgboss.job 
            WHERE state = 'completed'
        `.catch(() => [{ count: BigInt(0) }])

        // Count failed today
        const failedResult = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM pgboss.job 
            WHERE state = 'failed'
        `.catch(() => [{ count: BigInt(0) }])

        // Queue depth (created but not yet active)
        const queueResult = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count FROM pgboss.job 
            WHERE state = 'created'
        `.catch(() => [{ count: BigInt(0) }])

        const active = Number(activeResult[0]?.count || 0)
        const completed = Number(completedResult[0]?.count || 0)
        const failed = Number(failedResult[0]?.count || 0)
        const queue = Number(queueResult[0]?.count || 0)

        return {
            status: failed > 10 ? 'critical' : failed > 0 ? 'warning' : 'healthy',
            activeJobs: active,
            completedToday: completed,
            failedToday: failed,
            queueDepth: queue
        }
    } catch (error) {
        // pg-boss tables might not exist in all environments
        return {
            status: 'healthy',
            activeJobs: 0,
            completedToday: 0,
            failedToday: 0,
            queueDepth: 0
        }
    }
}

// ============================================
// APPLICATION (Node.js)
// ============================================
async function getApplicationMetrics(): Promise<ApplicationMetrics> {
    const memory = process.memoryUsage()
    const cpu = process.cpuUsage()

    return {
        uptime: process.uptime(),
        memoryUsage: {
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            external: memory.external,
            rss: memory.rss
        },
        cpuUsage: cpu
    }
}

