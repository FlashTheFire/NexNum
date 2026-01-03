
import 'dotenv/config'
import { refreshAllServiceAggregates } from './service-aggregates'
import { prisma } from './db'

async function runTest() {
    console.log('Testing refreshAllServiceAggregates...')
    try {
        await refreshAllServiceAggregates()
        console.log('✅ Success')
    } catch (e) {
        console.error('❌ Failed:', e)
    } finally {
        await prisma.$disconnect()
    }
}

runTest()
