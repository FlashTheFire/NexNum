
import { NextResponse } from 'next/server'
import { meili, INDEXES } from '@/lib/search'
import { syncAllProviders } from '@/lib/provider-sync'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const encoder = new TextEncoder()
    const customReadable = new ReadableStream({
        async start(controller) {
            const log = (msg: string) => {
                controller.enqueue(encoder.encode(msg + '\n'))
            }

            try {
                log('--- STARTING FULL RESET ---')

                // 1. Clear MeiliSearch
                log('Step 1: Clearing MeiliSearch...')
                try {
                    await meili.index(INDEXES.OFFERS).deleteAllDocuments()
                    log('✅ Deleted all documents from "offers" index')
                } catch (e) {
                    log(`⚠️ Error clearing MeiliSearch: ${e}`)
                }

                // 2. Clear Database (Optional/Risk? User asked to "clear all mili data")
                // I will NOT clear the DB unless explicitly asked, to preserve metadata overrides.
                // But the user said "clear all mili data". I will stick to Meili.

                // 3. Re-Sync
                log('Step 2: Triggering Sync...')

                // We wrap syncAllProviders to "capture" some logs if possible, 
                // but since it uses console.log internally, we can't easily capture them here without refactoring.
                // For now, we will wait for it to finish.
                log('⏳ Syncing providers... (Check server console for detailed progress)')

                const results = await syncAllProviders()

                log('--- SYNC RESULTS ---')
                results.forEach(r => {
                    log(`Provider: ${r.provider}`)
                    log(`  - Countries: ${r.countries}`)
                    log(`  - Services: ${r.services}`)
                    log(`  - Prices: ${r.prices}`)
                    log(`  - Status: ${r.error ? '❌ Failed: ' + r.error : '✅ Success'}`)
                    log('-------------------------')
                })

                log('✅ FULL RESET COMPLETE')
                controller.close()

            } catch (error) {
                log(`❌ FATAL ERROR: ${error}`)
                controller.close()
            }
        }
    })

    return new Response(customReadable, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
        },
    })
}
