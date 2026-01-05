
import 'dotenv/config'
import { prisma } from '../src/lib/db'

async function checkAkulaku() {
    console.log('🔍 Checking ServiceAggregate for Akulaku...')

    const result = await prisma.serviceAggregate.findFirst({
        where: {
            serviceName: { contains: 'Akulaku', mode: 'insensitive' }
        }
    })

    console.log('Result:', result ? JSON.stringify(result, null, 2) : 'NOT FOUND')

    // Also check how many aggregates we have total
    const count = await prisma.serviceAggregate.count()
    console.log(`\nTotal ServiceAggregate records: ${count}`)

    // Also show a sample of what aggregates look like
    const sample = await prisma.serviceAggregate.findFirst()
    console.log('\nSample Aggregate:', sample ? JSON.stringify(sample, null, 2) : 'EMPTY TABLE')

    await prisma.$disconnect()
}

checkAkulaku()
