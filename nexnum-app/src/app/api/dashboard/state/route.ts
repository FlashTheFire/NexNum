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
import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { getCurrencyService, MultiCurrencyPrice } from '@/lib/currency/currency-service'
import { cacheGet, CACHE_KEYS, CACHE_TTL, cacheInvalidate } from '@/lib/core/redis'
import { getServiceIconUrlByName } from '@/lib/search/search'
import { getCountryFlagUrl } from '@/lib/normalizers/country-flags'
import { createHash } from 'crypto'
import { logger } from '@/lib/core/logger'

interface DashboardState {
    balance: MultiCurrencyPrice       // Pure fiat map {USD, INR, RUB, EUR, GBP, CNY} — no points
    walletId: string
    numbers: any[]
    transactions: any[]
    unreadNotificationCount: number
    usageSummary: number[]
    totalSpent: MultiCurrencyPrice
    totalDeposited: MultiCurrencyPrice
}

/**
 * Generate ETag from data content
 */
function generateETag(data: DashboardState): string {
    // Hash key fields that affect UI display — use fiat USD as change signal (no points exposed)
    const hashInput = JSON.stringify({
        balanceUSD: data.balance.USD,
        numbersCount: data.numbers.length,
        // Include first number's ID and SMS count to detect changes
        firstNumber: data.numbers[0] ? { id: data.numbers[0].id, smsCount: data.numbers[0].smsCount } : null,
        transactionsCount: data.transactions.length,
        // Include first transaction ID to detect new transactions
        firstTxId: data.transactions[0]?.id,
        unreadNotificationCount: data.unreadNotificationCount,
        totalSpentUSD: data.totalSpent.USD,
        totalDepositedUSD: data.totalDeposited.USD,
    })
    return createHash('md5').update(hashInput).digest('hex').slice(0, 16)
}

export const GET = apiHandler(async (request, { user }) => {
    if (!user) {
        return ResponseFactory.error('Unauthorized', 401, 'E_UNAUTHORIZED')
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

    return ResponseFactory.success(state, 200, {
        'ETag': etag,
        'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
    })
}, {
    requiresAuth: true
})

/**
 * Fetch all dashboard data in optimized parallel queries
 */
async function fetchDashboardState(userId: string): Promise<DashboardState> {
    // Ensure wallet exists
    const walletId = await ensureWallet(userId)
    const currencyService = getCurrencyService()

    // Parallel fetch all data
    const [walletData, numbersRaw, transactionsRaw, unreadCount] = await Promise.all([
        // 1. Wallet: balance points + precomputed snapshot
        prisma.wallet.findUnique({
            where: { userId },
            select: { balance: true, balanceSnapshot: true }
        }),

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

        // 3. Transactions (recent 10)
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
                currencySnapshot: true,  // Immutable fiat context — client receives derived prices only
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

    // Map transactions — derive currencyPrices from snapshot (Zero-Math: no points sent to client)
    const transactions = transactionsRaw.map(t => {
        const snap = t.currencySnapshot as any | null

        // Build per-currency price map from snapshot rates + fiatEquivalent
        // If no snapshot (old transaction), currencyPrices is null → UI shows '—'
        let currencyPrices: Record<string, number> | null = null
        if (snap?.rates && typeof snap.fiatEquivalent === 'number') {
            // fiatEquivalent is in userCurrency. Derive all others from rates.
            // Convert fiatEquivalent → USD first, then to each currency
            const userCurrency: string = snap.userCurrency || 'USD'
            if (snap.rates[userCurrency] === undefined) {
                logger.warn('[api/dashboard/state] Preferred currency rate missing from snapshot rates', {
                    userCurrency,
                    ratesKeys: Object.keys(snap.rates)
                })
                currencyPrices = null
            } else {
                const userRate: number = snap.rates[userCurrency]
                const usdAmount: number = snap.fiatEquivalent / userRate
                currencyPrices = Object.fromEntries(
                    Object.entries(snap.rates as Record<string, number>)
                        .map(([code, rate]) => [code, parseFloat((usdAmount * rate).toFixed(5))])
                )
            }
        }

        return {
            id: t.id,
            type: t.type,
            amount: Math.abs(Number(t.amount)), // Points amount — kept for admin reference only
            description: t.description || '',
            createdAt: t.createdAt,
            currencyPrices,      // Fiat map derived from snapshot — client renders this
        }
    })

    // 5. Usage stats (Last 7 days spent)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const usageDaily = await prisma.walletTransaction.findMany({
        where: {
            walletId,
            createdAt: { gte: sevenDaysAgo },
            type: { in: ['purchase', 'manual_debit'] }
        },
        select: {
            amount: true,
            createdAt: true
        },
        orderBy: { createdAt: 'asc' }
    })

    // Aggregate into 7-day array of points
    const usagePoints = Array(7).fill(0)
    const now = new Date()
    usageDaily.forEach(tx => {
        const diffDays = Math.floor((now.getTime() - tx.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays >= 0 && diffDays < 7) {
            usagePoints[6 - diffDays] += Math.abs(Number(tx.amount))
        }
    })

    // Convert aggregated point values to USD fiat (Zero-Math: never send raw points to the client)
    const usageSummary = await Promise.all(
        usagePoints.map(points => currencyService.pointsToFiat(points, 'USD'))
    )

    // 6. Lifetime Aggregates
    const [spentAgg, depositAgg] = await Promise.all([
        prisma.walletTransaction.aggregate({
            where: { walletId, type: { in: ['purchase', 'manual_debit'] } },
            _sum: { amount: true }
        }),
        prisma.walletTransaction.aggregate({
            where: { walletId, type: { in: ['topup', 'manual_credit', 'referral_bonus', 'deposit'] } },
            _sum: { amount: true }
        })
    ])

    // Convert balance, spent, and deposited to pure fiat maps (ZERO CLIENT-SIDE CALCULATION)
    // Points are NEVER included in the response — client guard uses 'USD' in balance, not 'points'

    // BALANCE: use precomputed snapshot if available (skips live conversion)
    // Fallback to live pointsToAllFiat() for wallets with no snapshot yet (new users).
    const balancePoints = walletData?.balance?.toNumber() ?? 0
    const cachedBalance = walletData?.balanceSnapshot as Record<string, number> | null | undefined

    const [balance, totalSpent, totalDeposited] = await Promise.all([
        cachedBalance && 'USD' in cachedBalance
            ? Promise.resolve(cachedBalance as MultiCurrencyPrice)
            : currencyService.pointsToAllFiat(balancePoints),
        currencyService.pointsToAllFiat(Math.abs(Number(spentAgg._sum.amount || 0))),
        currencyService.pointsToAllFiat(Math.abs(Number(depositAgg._sum.amount || 0))),
    ])

    return {
        balance,
        walletId,
        numbers,
        transactions,
        unreadNotificationCount: unreadCount,
        usageSummary,
        totalSpent,
        totalDeposited
    }
}


