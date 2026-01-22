
import 'dotenv/config'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'

async function main() {
    console.log('🧪 Verifying Provider Price Caching')

    // 1. Get a provider
    const provider = await prisma.provider.findFirst({
        where: { isActive: true }
    })

    if (!provider) {
        console.log('❌ No active provider found')
        return
    }

    console.log(`Using provider: ${provider.name}`)
    const engine = new DynamicProvider(provider)

    // Clear cache first to ensure test is valid
    const key = `provider:prices:${provider.name}:us:any`
    const cacheKeyAll = `provider:prices:${provider.name}:us:all` // default serviceCode is undefined -> 'all' in our logic?
    // In our code: serviceCode || 'all'

    // Actually the code uses: `provider:prices:${this.name}:${countryCode || 'all'}:${serviceCode || 'all'}`
    const targetKey1 = `provider:prices:${provider.name}:us:all`
    await redis.del(targetKey1)

    // 2. First Call (Miss)
    console.log('   Fetching (1st call - expecting miss)...')
    const start1 = performance.now()
    try {
        const res1 = await engine.getPrices('us')
        const dur1 = performance.now() - start1
        console.log(`   1st result count: ${res1.length}`)
        console.log(`   ⏱️ Time: ${dur1.toFixed(2)}ms`)
    } catch (e) {
        console.log('   ⚠️ Error in 1st call (might be network/config, but we care about cache logic next):', e.message)
    }

    // 3. Second Call (Hit)
    console.log('   Fetching (2nd call - expecting HIT)...')
    const start2 = performance.now()
    try {
        const res2 = await engine.getPrices('us')
        const dur2 = performance.now() - start2
        console.log(`   2nd result count: ${res2.length}`)
        console.log(`   ⏱️ Time: ${dur2.toFixed(2)}ms`)

        if (dur2 < 20) {
            console.log('✅ PASS: Cache Hit Detected (< 20ms)')
        } else {
            console.log('❌ FAIL: Too slow for cache hit? (or first call failed to cache)')
            // Check if key exists
            const ttl = await redis.ttl(targetKey1)
            console.log(`   Key TTL: ${ttl}`)
        }

    } catch (e) {
        console.log('   ❌ Error in 2nd call:', e)
    }

    process.exit(0)
}

main()
