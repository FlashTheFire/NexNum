// Force reload of Prisma Client types
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@prisma/client'
// Force refresh of Prisma types: Currency, SystemSettings, preferredCurrency

// Create PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    console.warn('DATABASE_URL environment variable is not set - database operations will fail')
}

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
    prismaRead: PrismaClient | undefined
}

function createPrismaClient(url?: string): PrismaClient {
    const connectionString = url || process.env.DATABASE_URL
    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set')
    }

    // Optimization: Use standard TCP for read replicas if pooling is an issue,
    // or same pool config. Here we assume direct connection or pgbouncer.
    const isProduction = process.env.NODE_ENV === 'production' || connectionString.includes('supabase.com')

    // INDUSTRIAL HARDENING: Remove sslmode from connection string to prevent pg
    // from overriding our explicit SSL object with its own 'verify-full' logic.
    const cleanUrl = connectionString.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/(\?|&)$/, '')

    // Pool size budget: Supabase's session-mode pooler caps each *project* at
    // pool_size=15 (their default for the free/pro plan). NexNum runs THREE
    // services — app, worker (8 cron jobs), socket — each instantiating its
    // own pg.Pool. 4 + 4 + 4 = 12, leaving 3 headroom for psql / ad-hoc admin.
    // Override with PG_POOL_MAX to tune per-service if you scale differently.
    const poolMax = (() => {
        const raw = parseInt(process.env.PG_POOL_MAX ?? '', 10)
        if (Number.isFinite(raw) && raw > 0) return Math.min(raw, isProduction ? 5 : 10)
        return isProduction ? 4 : 5
    })()
    const poolMin = isProduction ? 1 : 0
    // Identify this service in pg_stat_activity so we can see who's hot.
    const serviceName =
        process.env.npm_lifecycle_event?.includes('worker') ? 'nexnum-worker' :
        process.env.npm_lifecycle_event?.includes('socket') ? 'nexnum-socket' :
        process.env.APP_SERVICE_NAME ||
        (isProduction ? 'nexnum-app' : 'nexnum-dev')

    // Normalize the URL so the pg.Pool plays nicely with Supabase's session-mode
    // pooler (port 5432). Transaction-mode (port 6543) recycles idle sockets
    // aggressively, which causes long-lived pools to hand out dead sockets —
    // the cause of the "timeout exceeded when trying to connect" flood.
    const normalized = (() => {
        try {
            const u = new URL(cleanUrl)
            // pgbouncer=true tells pg to skip certain session-only features
            if (!u.searchParams.has('pgbouncer')) u.searchParams.set('pgbouncer', 'true')
            // Cap client-side connections to stay under Supabase per-client quotas
            if (!u.searchParams.has('connection_limit')) {
                u.searchParams.set('connection_limit', String(poolMax))
            }
            // application_name makes it easy to identify these sockets in pg_stat_activity
            if (!u.searchParams.has('application_name')) {
                u.searchParams.set('application_name', serviceName)
            }
            return u.toString()
        } catch {
            return cleanUrl
        }
    })()

    // Connection-acquisition timeout.
    // Default 3s was too tight for the free-tier session pooler during burst
    // batches, but the right fix is concurrency caps (see provider-sync and
    // service-aggregates). Override via PG_CONNECT_TIMEOUT_MS to tune.
    const connectionTimeoutMs = (() => {
        const raw = parseInt(process.env.PG_CONNECT_TIMEOUT_MS ?? '', 10)
        if (Number.isFinite(raw) && raw > 0) return raw
        return isProduction ? 8_000 : 10_000
    })()

    const pool = new Pool({
        connectionString: normalized,
        max: poolMax,
        min: poolMin,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: connectionTimeoutMs,
        maxUses: 1_000,
        allowExitOnIdle: true,
        keepAlive: true,
        keepAliveInitialDelayMillis: 5_000,
        // Force SSL for remote databases
        ssl: isProduction ? {
            rejectUnauthorized: false,
        } : undefined,
    })

    // Surface "pool exhausted" errors instead of silently hanging the request
    pool.on('error', (err) => {
        console.error('[pg.Pool] idle client error:', err.message)
    })

    // Graceful shutdown to release connections back to PgBouncer pool
    const shutdown = async () => {
        try {
            await pool.end()
        } catch (e) {
            console.error('Pool shutdown error:', e)
        }
        process.exit(0)
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)

    const adapter = new PrismaPg(pool)

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        transactionOptions: {
            maxWait: 10000,  // 10 seconds max wait to acquire a transaction
            timeout: 30000, // 30 seconds transaction timeout (was 5000ms default)
        },
    })
}

const prismaProxy = new Proxy({} as PrismaClient, {
    get: (target, prop, receiver) => {
        if (!globalForPrisma.prisma) {
            globalForPrisma.prisma = createPrismaClient()
        }
        return Reflect.get(globalForPrisma.prisma, prop, receiver)
    }
})

const prismaReadProxy = new Proxy({} as PrismaClient, {
    get: (target, prop, receiver) => {
        if (!globalForPrisma.prismaRead) {
            globalForPrisma.prismaRead = process.env.DATABASE_READ_URL
                ? createPrismaClient(process.env.DATABASE_READ_URL)
                : (globalForPrisma.prisma ?? createPrismaClient())
        }
        return Reflect.get(globalForPrisma.prismaRead, prop, receiver)
    }
})

export const prisma = prismaProxy
export const prismaRead = prismaReadProxy

/**
 * Expose the configured pg.Pool max so other modules can size their own
 * concurrency (e.g. pLimit) to match. Always returns at least 1, even if
 * called before the pool is created. Reserve at least 1 socket for
 * ad-hoc queries (healthchecks, out-of-band admin calls) by subtracting 1
 * from the result; callers running heavy batches in a loop should
 * use `getPoolMax() - 1` for their `pLimit` cap.
 */
export function getPoolMax(): number {
    const isProduction = process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL ?? '').includes('supabase.com')
    const raw = parseInt(process.env.PG_POOL_MAX ?? '', 10)
    if (Number.isFinite(raw) && raw > 0) return Math.min(raw, isProduction ? 5 : 10)
    return isProduction ? 4 : 5
}

/** Safe concurrency cap: leaves one socket free for healthchecks / out-of-band work. */
export function getSafeConcurrency(): number {
    return Math.max(1, getPoolMax() - 1)
}

if (process.env.NODE_ENV !== 'production') {
    // We don't need to assign to globalForPrisma here since the Proxy handles it
}



// Ensure user has a wallet (create if not exists)
export async function ensureWallet(userId: string): Promise<string> {
    const existing = await prisma.wallet.findUnique({
        where: { userId }
    })

    if (existing) return existing.id

    const wallet = await prisma.wallet.create({
        data: { userId }
    })

    return wallet.id
}
