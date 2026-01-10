
import 'dotenv/config'
import { getIndexStats, meili, INDEXES } from './search'

async function checkIndex() {
    const stats = await getIndexStats()
    console.log('📊 Index Stats:', stats)

    // Check specific document for Telegram
    const index = meili.index(INDEXES.OFFERS)
    const tgResults = await index.search('telegram', { limit: 5 })
    console.log('🔎 Search "telegram":', tgResults.hits.length, 'hits')
    if (tgResults.hits.length > 0) console.log('   Sample:', tgResults.hits[0].serviceName)

    const codeResults = await index.search('tg', { limit: 10, showRankingScore: true })
    console.log('🔎 Search "tg":', codeResults.hits.length, 'hits')
    codeResults.hits.forEach((h: any, i) => {
        console.log(`   ${i + 1}. ${h.serviceName} (${h.serviceSlug}) - Score: ${h._rankingScore}`)
    })
}

checkIndex()
