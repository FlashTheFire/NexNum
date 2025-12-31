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

    const pool = new Pool({ connectionString })
    const adapter = new PrismaPg(pool)

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}

// Wallet balance helper (ledger-based)
export async function getWalletBalance(walletId: string): Promise<number> {
    const result = await prisma.walletTransaction.aggregate({
        where: { walletId },
        _sum: { amount: true }
    })
    return Number(result._sum.amount ?? 0)
}

// Get wallet balance by user ID
export async function getUserBalance(userId: string): Promise<number> {
    const wallet = await prisma.wallet.findUnique({
        where: { userId },
        include: {
            transactions: {
                select: { amount: true }
            }
        }
    })

    if (!wallet) return 0

    return wallet.transactions.reduce((sum, tx) => sum + Number(tx.amount), 0)
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
