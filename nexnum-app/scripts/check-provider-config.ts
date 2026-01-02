
import { prisma } from '../src/lib/db'

async function check() {
    const providers = await prisma.provider.findMany({
        where: { name: { in: ['5sim', 'grizzlysms', 'smsbower'] } }
    })

    for (const p of providers) {
        console.log(`Provider: ${p.name}`)
        console.log(`Endpoints: ${JSON.stringify(p.endpoints).substring(0, 100)}...`)
        console.log(`Mappings: ${JSON.stringify(p.mappings).substring(0, 100)}...`)
        console.log('---')
    }
}

check().catch(console.error)
