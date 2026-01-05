
import 'dotenv/config'
import { searchCountries } from '../src/lib/search'

async function testSearchFix() {
    console.log('🧪 Testing Search Query Normalization...')

    const queries = ['telegram', 'Telegram', 'tg']

    for (const q of queries) {
        console.log(`\n🔎 Searching for countries with serviceSlug="${q}"...`)
        const result = await searchCountries(q)

        console.log(`   Result: ${result.total} countries found.`)
        if (result.total > 0) {
            console.log(`   ✅ PASSED: Found ${result.total} matches (e.g. ${result.countries[0].name})`)
        } else {
            console.log(`   ❌ FAILED: Zero matches for "${q}"`)
        }
    }
}

testSearchFix()
