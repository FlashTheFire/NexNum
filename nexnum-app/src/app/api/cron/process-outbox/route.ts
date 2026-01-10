import { NextResponse } from 'next/server'
import { processOutboxEvents } from '@/lib/outbox'
import { processActivationOutbox } from '@/lib/activation-outbox-worker'

export const dynamic = 'force-dynamic'

/**
 * Outbox Processor
 * Triggers the processing of pending outbox events.
 * Call this every 1-10 seconds via external Cron or Vercel Cron.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Process both legacy (MeiliSearch sync) and activation outbox events
        const [legacyResults, activationResults] = await Promise.all([
            processOutboxEvents(),
            processActivationOutbox()
        ])

        return NextResponse.json({
            success: true,
            legacy: legacyResults,
            activation: activationResults
        })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

