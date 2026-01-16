// Force reload of Prisma Client types
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Create PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
    console.warn('DATABASE_URL environment variable is not set - database operations will fail')
}

// Singleton pattern for Prisma client
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set')
    }

    const pool = new Pool({
        connectionString,
        max: process.env.NODE_ENV === 'development' ? 5 : 10, // Kept low for Supabase session pooler limits
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // 10s timeout

    })

    const adapter = new PrismaPg(pool)

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
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
