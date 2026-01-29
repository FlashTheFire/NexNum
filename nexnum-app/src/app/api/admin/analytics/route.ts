import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { AuthGuard } from '@/lib/auth/guard'

/**
 * Analytics API for Admin Dashboard
 * GET /api/admin/analytics
 * 
 * Returns comprehensive analytics data:
 * - Revenue metrics (daily, weekly, monthly)
 * - User growth trends
 * - Provider performance (Advanced Metrics Engine)
 * - Transaction volumes
 */
import { AdvancedMetricsCalculator } from '@/lib/metrics/advanced-metrics'
export async function GET(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '7d'

    try {
        const now = new Date()
        let startDate: Date

        switch (period) {
            case '24h': startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break
            case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
            case '30d': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
            case '90d': startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break
            default: startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        }

        // Parallel data fetching for performance
        const [
            totalUsers,
            newUsers,
            totalTransactions,
            revenueData,
            providerStats,
            recentActivity,
            numberStats,
            profitData,
            advancedMetrics,
        ] = await Promise.all([
            // Total users
            prisma.user.count(),

            // New users in period
            prisma.user.count({
                where: { createdAt: { gte: startDate } }
            }),

            // Total transactions in period
            prisma.walletTransaction.count({
                where: { createdAt: { gte: startDate } }
            }),

            // Revenue data - group by day
            prisma.walletTransaction.groupBy({
                by: ['createdAt'],
                where: {
                    createdAt: { gte: startDate },
                    type: { in: ['purchase', 'topup', 'admin_credit'] }
                },
                _sum: { amount: true },
                orderBy: { createdAt: 'asc' }
            }),

            // Provider performance
            prisma.provider.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    name: true,
                    displayName: true,
                    balance: true,
                    priority: true,
                    syncCount: true
                },
                orderBy: { priority: 'desc' }
            }),

            // Recent audit logs
            prisma.auditLog.findMany({
                where: { createdAt: { gte: startDate } },
                orderBy: { createdAt: 'desc' },
                take: 20,
                include: {
                    user: { select: { email: true, name: true } }
                }
            }),

            // Number stats by status
            prisma.number.groupBy({
                by: ['status'],
                _count: true
            }),

            // Profit data - fetch raw records for period to calculate daily profit
            prisma.number.findMany({
                where: { createdAt: { gte: startDate } },
                // @ts-ignore - Prisma types might be out of sync in IDE
                select: { createdAt: true, profit: true }
            }),

            // Advanced Metrics (Provider health, margins, etc.)
            new AdvancedMetricsCalculator(60 * 24).calculateAll() // 24h window for advanced metrics
        ])

        // Process revenue into chart-friendly format
        const revenueByDay = processRevenueData(revenueData, startDate, now)

        // Process profit into chart-friendly format (Manual Aggregation to avoid Prisma groupBy type issues)
        const profitByDay = processProfitData(profitData, startDate, now)

        // Calculate totals
        const totalRevenue = revenueData.reduce((sum, item) =>
            sum + (Number(item._sum.amount) || 0), 0
        )

        // User growth calculation
        const previousPeriodStart = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()))
        const previousUsers = await prisma.user.count({
            where: {
                createdAt: {
                    gte: previousPeriodStart,
                    lt: startDate
                }
            }
        })
        const userGrowth = previousUsers > 0
            ? ((newUsers - previousUsers) / previousUsers * 100).toFixed(1)
            : '100'

        return NextResponse.json({
            period,
            overview: {
                totalUsers,
                newUsers,
                userGrowth: `${userGrowth}%`,
                totalTransactions,
                totalRevenue: totalRevenue.toFixed(2),
            },
            charts: {
                revenue: revenueByDay,
                profit: processProfitData(profitData, startDate, now),
            },
            advanced: {
                overallHealth: advancedMetrics.aggregate.overallHealthScore,
                slaCompliance: advancedMetrics.aggregate.platformSlaCompliance,
                avgMargin: advancedMetrics.aggregate.avgMargin,
                providers: advancedMetrics.providers.map(p => ({
                    id: p.providerId,
                    name: p.providerName,
                    successRate: p.adjustedSuccessRate.value,
                    latency: p.providerLatencyEfficiency.value,
                    margin: p.marginPerService.value
                }))
            },
            providers: providerStats.map(p => ({
                ...p,
                balance: Number(p.balance),
            })),
            recentActivity: recentActivity.map(log => ({
                id: log.id,
                action: log.action,
                resourceType: log.resourceType,
                resourceId: log.resourceId,
                user: log.user?.email || 'System',
                timestamp: log.createdAt,
                metadata: log.metadata,
            })),
            numberStats: Object.fromEntries(
                numberStats.map(s => [s.status, s._count])
            ),
        })

    } catch (error) {
        console.error('Analytics error:', error)
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
    }
}

/**
 * Process raw revenue data into daily chart format
 */
function processRevenueData(
    data: any[],
    startDate: Date,
    endDate: Date
): { date: string; revenue: number }[] {
    const dayMs = 24 * 60 * 60 * 1000
    const days: { date: string; revenue: number }[] = []

    // Create empty days
    let current = new Date(startDate)
    while (current <= endDate) {
        days.push({
            date: current.toISOString().split('T')[0],
            revenue: 0
        })
        current = new Date(current.getTime() + dayMs)
    }

    // Fill in actual revenue
    for (const item of data) {
        const date = new Date(item.createdAt).toISOString().split('T')[0]
        const dayEntry = days.find(d => d.date === date)
        if (dayEntry) {
            dayEntry.revenue += Number(item._sum.amount) || 0
        }
    }

    return days
}

/**
 * Process raw profit data into daily chart format
 */
function processProfitData(
    data: any[],
    startDate: Date,
    endDate: Date
): { date: string; profit: number }[] {
    const dayMs = 24 * 60 * 60 * 1000
    const days: { date: string; profit: number }[] = []

    let current = new Date(startDate)
    while (current <= endDate) {
        days.push({
            date: current.toISOString().split('T')[0],
            profit: 0
        })
        current = new Date(current.getTime() + dayMs)
    }

    for (const item of data) {
        const date = new Date(item.createdAt).toISOString().split('T')[0]
        const dayEntry = days.find(d => d.date === date)
        if (dayEntry) {
            dayEntry.profit += Number(item.profit) || 0
        }
    }

    return days
}

