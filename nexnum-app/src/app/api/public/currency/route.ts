
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { ResponseFactory } from '@/lib/api/response-factory'


export const dynamic = 'force-dynamic'

/**
 * GET /api/public/currency
 * Public API for frontend to get rates and settings
 */
export async function GET(request: Request) {
    const user = await getCurrentUser(request.headers)

    const [currencies, settings, userData] = await Promise.all([
        // @ts-ignore - Prisma linter sync issue
        prisma.currency.findMany({
            where: { isActive: true },
            select: { code: true, name: true, symbol: true, rate: true }
        }),
        // @ts-ignore - Prisma linter sync issue
        prisma.systemSettings.findUnique({ where: { id: 'default' } }),
        user ? prisma.user.findUnique({
            where: { id: user.userId },
            // @ts-ignore - Prisma linter sync issue
            select: { preferredCurrency: true }
        }) : null
    ])

    // Filter out sensitive settings to prevent leakage
    const publicSettings = settings ? {
        id: settings.id,
        pointsRate: Number(settings.pointsRate),
        paymentsEnabled: settings.paymentsEnabled,
        upiProviderMode: settings.upiProviderMode,
        depositMinAmount: Number(settings.depositMinAmount),
        depositMaxAmount: Number(settings.depositMaxAmount),
        depositTimeoutMins: settings.depositTimeoutMins,
        maxPendingDeposits: settings.maxPendingDeposits,
        depositBonusPercent: Number(settings.depositBonusPercent),
    } : null

    const currenciesMap = currencies
        .filter(curr => curr.code !== 'POINTS')
        .reduce((acc, curr) => ({
            ...acc,
            [curr.code]: curr
        }), {})

    const preferredCurrencyCode = userData?.preferredCurrency || settings?.displayCurrency || 'USD'

    return ResponseFactory.success({
        currencies: currenciesMap,
        settings: publicSettings,
        preferredCurrency: preferredCurrencyCode,
    })
}
