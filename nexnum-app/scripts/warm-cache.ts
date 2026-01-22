
import 'dotenv/config'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import pLimit from 'p-limit'

const COUNTRIES = ['us', 'gb', 'ru', 'cn', 'id', 'vn', 'th', 'ph', 'my', 'kp'] // Top 10
const SERVICES = ['wa', 'tg', 'ig', 'go', 'fb', 'mm', 'wb', 'vi', 'ya', 'tw']   // Top 10

async function main() {
    console.log('🔥 Starting Cache Warming...')
    const startTotal = Date.now()

    // 1. Get active providers
    const providers = await prisma.provider.findMany({
        where: { isActive: true }
    })

    if (providers.length === 0) {
        console.log('⚠️ No active providers found.')
        return
    }

    console.log(`Found ${providers.length} active providers: ${providers.map(p => p.name).join(', ')}`)

    const limit = pLimit(5) // Concurrency limit
    const tasks = []

    for (const provider of providers) {
        const engine = new DynamicProvider(provider)

        // Strategy: Warm "All Services" for Top Countries (Most common query)
        // AND "Specific Service" for Global (if needed, but usually country-first)

        for (const country of COUNTRIES) {
            tasks.push(limit(async () => {
                const start = Date.now()
                try {
                    // Fetching with service='all' (undefined) to warm the "All Services" view for a country
                    // This often returns a huge list and caches it if logic supports, 
                    // BUT getPrices(country) usually fetches specific service or all? 
                    // DynamicProvider.getPrices(country) -> requests provider for all services in that country if supported
                    // If provider requires service, it might fail or return empty.
                    // Let's try specific pairs first as that's safer for targeted warming.

                    // Actually, let's warm the specific popular pairs
                    for (const service of SERVICES) {
                        try {
                            // We don't need the result, just the side-effect of caching
                            const res = await engine.getPrices(country, service)
                            // console.log(`   ✅ Warmed ${provider.name}:${country}:${service} (${res.length} items)`)
                        } catch (e) {
                            // console.warn(`   ⚠️ Failed ${provider.name}:${country}:${service}`, e.message)
                        }
                    }

                    // Also try to warm "All Services" for the country if the provider supports it
                    // This is the most valuable cache key: provider:prices:name:us:all
                    try {
                        const res = await engine.getPrices(country)
                        console.log(`   ✅ Warmed ${provider.name}:${country}:ALL (${res.length} items) in ${Date.now() - start}ms`)
                    } catch (e) {
                        // console.warn(`   ⚠️ Failed ${provider.name}:${country}:ALL`, e.message)
                    }

                } catch (e) {
                    console.error(`❌ Error warming ${provider.name}:${country}`, e)
                }
            }))
        }
    }

    await Promise.all(tasks)

    const dur = (Date.now() - startTotal) / 1000
    console.log(`🔥 Cache Warming Completed in ${dur.toFixed(2)}s`)
    console.log(`   - Providers: ${providers.length}`)
    console.log(`   - Countries: ${COUNTRIES.length}`)
    console.log(`   - Services: ${SERVICES.length}`)

    // Force exit to close DB/Redis connections
    process.exit(0)
}

main()
