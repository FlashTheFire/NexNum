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
    const isProduction = process.env.NODE_ENV === 'production'
    const pool = new Pool({
        connectionString,
        max: isProduction ? 5 : 3, // Reduced for PgBouncer session mode compatibility
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000, // Faster failure
        maxUses: 7500, // Recycle connections to prevent memory leaks
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
