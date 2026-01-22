
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { apiHandler } from '@/lib/api/api-handler'
import { currencyService } from '@/lib/currency/currency-service'

/**
 * GET /api/admin/finance/currency
 * Returns all currencies and system settings
 */
export const GET = apiHandler(async () => {
    const [currencies, settings] = await Promise.all([
        // @ts-ignore - Prisma linter sync issue
        prisma.currency.findMany({ orderBy: { code: 'asc' } }),
        // @ts-ignore - Prisma linter sync issue
        prisma.systemSettings.findUnique({ where: { id: 'default' } })
    ])

    return NextResponse.json({ currencies, settings })
})

/**
 * PATCH /api/admin/finance/currency
 * Updates currency rates or system settings
 */
export const PATCH = apiHandler(async (req, { body }) => {
    const { action, ...data } = body

    if (action === 'update_settings') {
        // @ts-ignore - Prisma linter sync issue
        const settings = await prisma.systemSettings.update({
            where: { id: 'default' },
            data: {
                baseCurrency: data.baseCurrency,
                displayCurrency: data.displayCurrency,
                pointsEnabled: data.pointsEnabled,
                pointsName: data.pointsName,
                pointsRate: data.pointsRate,
            }
        })
        return NextResponse.json({ settings })
    }

    if (action === 'update_currency') {
        // @ts-ignore - Prisma linter sync issue
        const currency = await prisma.currency.update({
            where: { code: data.code },
            data: {
                rate: data.rate,
                isActive: data.isActive,
                autoUpdate: data.autoUpdate,
                name: data.name,
                symbol: data.symbol
            }
        })
        return NextResponse.json({ currency })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
})

/**
 * POST /api/admin/finance/currency/sync
 * Manually trigger exchange rate sync
 */
export const POST = apiHandler(async () => {
    await currencyService.syncRates()
    return NextResponse.json({ success: true })
})
