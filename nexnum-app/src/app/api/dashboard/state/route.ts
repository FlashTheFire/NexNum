/**
 * GET /api/dashboard/state - Batch endpoint for dashboard data
 * 
 * Returns all dashboard state in a single cached request:
 * - Wallet balance
 * - Active numbers (limit 20)
 * - Recent transactions (limit 10)
 * - Unread notification count
 * 
 * Uses Redis caching with 10s TTL for production performance.
 * Supports ETag for conditional fetching (304 Not Modified).
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { WalletService } from '@/lib/wallet/wallet'
import { cacheGet, CACHE_KEYS, CACHE_TTL, cacheInvalidate } from '@/lib/core/redis'
import { getServiceIconUrlByName } from '@/lib/search/search'
import { getCountryFlagUrl } from '@/lib/normalizers/country-flags'
import { createHash } from 'crypto'

interface DashboardState {
    balance: number
    walletId: string
    numbers: any[]
    transactions: any[]
    unreadNotificationCount: number
}

/**
 * Generate ETag from data content
 */
function generateETag(data: DashboardState): string {
    // Hash key fields that affect UI display
    const hashInput = JSON.stringify({
        balance: data.balance,
        numbersCount: data.numbers.length,
        // Include first number's ID and SMS count to detect changes
        firstNumber: data.numbers[0] ? { id: data.numbers[0].id, smsCount: data.numbers[0].smsCount } : null,
        transactionsCount: data.transactions.length,
        // Include first transaction ID to detect new transactions
        firstTxId: data.transactions[0]?.id,
        unreadNotificationCount: data.unreadNotificationCount,
    })
    return createHash('md5').update(hashInput).digest('hex').slice(0, 16)
}

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Use Redis cache-aside pattern
        const state = await cacheGet<DashboardState>(
            CACHE_KEYS.dashboardState(user.userId),
            async () => fetchDashboardState(user.userId),
            CACHE_TTL.DASHBOARD_STATE
        )

        // Generate ETag from content
        const etag = `"${generateETag(state)}"`

        // Check If-None-Match header for conditional request
        const clientEtag = request.headers.get('If-None-Match')
        if (clientEtag === etag) {
            // Data unchanged - return 304 Not Modified (no body)
            return new NextResponse(null, {
                status: 304,
                headers: {
                    'ETag': etag,
                    'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
                }
            })
        }

        return NextResponse.json({
            success: true,
            ...state,
        }, {
            headers: {
                'ETag': etag,
                'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
            }
        })
    } catch (error) {
        console.error('[Dashboard State] Error:', error)
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

/**
 * Fetch all dashboard data in optimized parallel queries
 */
async function fetchDashboardState(userId: string): Promise<DashboardState> {
    // Ensure wallet exists
    const walletId = await ensureWallet(userId)

    // Parallel fetch all data
    const [balance, numbersRaw, transactionsRaw, unreadCount] = await Promise.all([
        // 1. Balance
        WalletService.getBalance(userId),

        // 2. Numbers (active + recent, limit 20)
        prisma.number.findMany({
            where: { ownerId: userId },
            include: {
                smsMessages: {
                    orderBy: { receivedAt: 'desc' },
                    take: 1, // Only latest SMS for preview
                },
                _count: {
                    select: { smsMessages: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        }),

        // 3. Transactions (recent 10) - Uses walletId from ensureWallet
        prisma.walletTransaction.findMany({
            where: { walletId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                type: true,
                amount: true,
                description: true,
                createdAt: true,
            }
        }),

        // 4. Unread notification count
        prisma.notification.count({
            where: {
                userId,
                read: false,
            }
        }),
    ])

    // Map numbers with icon URLs (batch-optimized)
    const numbers = await Promise.all(numbersRaw.map(async n => {
        const serviceIconUrl = (n as any).serviceIconUrl
            || (n.serviceName ? await getServiceIconUrlByName(n.serviceName) : undefined)

        const countryIconUrl = (n as any).countryIconUrl
            || (n.countryName ? await getCountryFlagUrl(n.countryName) : undefined)

        return {
            id: n.id,
            phoneNumber: n.phoneNumber,
            countryCode: n.countryCode,
            countryName: n.countryName,
            countryIconUrl,
            serviceName: n.serviceName,
            serviceCode: n.serviceCode,
            serviceIconUrl,
            price: Number(n.price),
            provider: n.provider,
            status: n.status,
            expiresAt: n.expiresAt,
            purchasedAt: n.purchasedAt,
            smsCount: n._count.smsMessages,
            latestSms: n.smsMessages[0] ? {
                content: n.smsMessages[0].content,
                code: n.smsMessages[0].code,
                receivedAt: n.smsMessages[0].receivedAt,
            } : null,
        }
    }))

    // Map transactions
    const transactions = transactionsRaw.map(t => ({
        id: t.id,
        type: t.type,
        amount: Math.abs(Number(t.amount)),
        description: t.description || '',
        createdAt: t.createdAt,
    }))

    return {
        balance,
        walletId,
        numbers,
        transactions,
        unreadNotificationCount: unreadCount,
    }
}

/**
 * Helper to invalidate dashboard cache (call from mutation endpoints)
 */
export async function invalidateDashboardCache(userId: string): Promise<void> {
    await cacheInvalidate(CACHE_KEYS.dashboardState(userId))
    await cacheInvalidate(CACHE_KEYS.userBalance(userId))
}
