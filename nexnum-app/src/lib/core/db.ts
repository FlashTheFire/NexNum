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
        max: isProduction ? 20 : 5, // Increased for pro scaling
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000, // Faster failure
        maxUses: 7500, // Recycle connections to prevent memory leaks
    })

    const adapter = new PrismaPg(pool)

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Read Replica Client (falls back to primary if no read replica configured)
export const prismaRead = globalForPrisma.prismaRead ?? (
    process.env.DATABASE_READ_URL
        ? createPrismaClient(process.env.DATABASE_READ_URL)
        : prisma
)

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
    globalForPrisma.prismaRead = prismaRead
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
