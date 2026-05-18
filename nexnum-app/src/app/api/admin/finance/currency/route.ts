import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { apiHandler } from '@/lib/api/api-handler'
import { getCurrencyService } from '@/lib/currency/currency-service'
import { logger } from '@/lib/core/logger'
import { publishOutboxEvent } from '@/lib/activation/outbox'

/**
 * GET /api/admin/finance/currency
 * Returns all currencies and system settings
 */
export const GET = apiHandler(async () => {
    const [currencies, settings] = await Promise.all([
        prisma.currency.findMany({ orderBy: { code: 'asc' } }),
        prisma.systemSettings.findUnique({ where: { id: 'default' } })
    ])

    return NextResponse.json({ currencies, settings })
})

/**
 * PATCH /api/admin/finance/currency
 * Updates currency rates or system settings, then:
 * 1. Increments ratesVersion so stale Meilisearch docs can be identified
 * 2. Invalidates the currency Redis cache immediately
 * 3. Triggers a background Meilisearch re-index of stale offer currencyPrices
 * 4. Triggers a background refresh of all wallet balance snapshots
 */
export const PATCH = apiHandler(async (req, { body }) => {
    const { action, ...data } = body

    if (action === 'update_settings') {
        const settings = await prisma.systemSettings.update({
            where: { id: 'default' },
            data: {
                baseCurrency: data.baseCurrency,
                displayCurrency: data.displayCurrency,
                pointsEnabled: data.pointsEnabled,
                pointsName: data.pointsName,
                pointsRate: data.pointsRate,
                ratesVersion: { increment: 1 },  // Mark all Meilisearch docs as stale
            }
        })

        // Invalidate Redis cache immediately — next API call gets fresh rates
        await getCurrencyService().invalidateCache()

        // Enqueue durable Meilisearch reindex via Outbox worker (handles 100k+ offers safely)
        const newVersion = settings.ratesVersion
        await publishOutboxEvent({
            aggregateType: 'system',
            aggregateId: 'currency',
            eventType: 'currency.rates_changed',
            payload: { ratesVersion: newVersion, offset: 0 }
        })
        logger.info('[admin/currency] Enqueued currency.rates_changed outbox event', { ratesVersion: newVersion })

        return NextResponse.json({ settings })
    }

    if (action === 'update_currency') {
        const [currency, updatedSettings] = await prisma.$transaction(async (tx) => {
            const cur = await tx.currency.update({
                where: { code: data.code },
                data: {
                    rate: data.rate,
                    isActive: data.isActive,
                    autoUpdate: data.autoUpdate,
                    name: data.name,
                    symbol: data.symbol
                }
            })
            const settings = await tx.systemSettings.update({
                where: { id: 'default' },
                data: { ratesVersion: { increment: 1 } }
            })
            return [cur, settings]
        })

        // Invalidate Redis cache immediately — next API call gets fresh rates
        await getCurrencyService().invalidateCache()

        // Enqueue durable Meilisearch reindex via Outbox worker (handles 100k+ offers safely)
        const newVersion = updatedSettings.ratesVersion
        await publishOutboxEvent({
            aggregateType: 'system',
            aggregateId: 'currency',
            eventType: 'currency.rates_changed',
            payload: { ratesVersion: newVersion, offset: 0 }
        })
        logger.info('[admin/currency] Enqueued currency.rates_changed outbox event', { ratesVersion: newVersion })

        return NextResponse.json({ currency })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
})

/**
 * POST /api/admin/finance/currency/sync
 * Manually trigger exchange rate sync from configured FX source
 */
export const POST = apiHandler(async () => {
    const currencyService = getCurrencyService()
    const stats = await currencyService.syncRates()

    // Increment ratesVersion to mark all cached prices stale
    const updatedSettings = await prisma.systemSettings.update({
        where: { id: 'default' },
        data: { ratesVersion: { increment: 1 } }
    })

    await currencyService.invalidateCache()

    // Enqueue durable reindex
    const newVersion = updatedSettings.ratesVersion
    await publishOutboxEvent({
        aggregateType: 'system',
        aggregateId: 'currency',
        eventType: 'currency.rates_changed',
        payload: { ratesVersion: newVersion, offset: 0 }
    })
    logger.info('[admin/currency] Enqueued currency.rates_changed outbox event (post-sync)', { ratesVersion: newVersion })

    return NextResponse.json({ success: true, stats })
})
