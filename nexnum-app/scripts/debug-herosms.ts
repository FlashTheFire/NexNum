
import { prisma } from '../src/lib/db'
import { DynamicProvider } from '../src/lib/dynamic-provider'
import * as dotenv from 'dotenv'

dotenv.config()

async function main() {
    const providerId = '63e1406b-54fe-4aa1-bf06-b2eafab10ff6' // HeroSMS
    const provider = await prisma.provider.findUnique({ where: { id: providerId } })

    if (!provider) {
        console.error('Provider not found')
        return
    }

    console.log(`Testing provider: ${provider.name}`)
    console.log('Mappings:', JSON.stringify(provider.mappings, null, 2))

    const engine = new DynamicProvider(provider)

    try {
        console.log('Fetching countries...')
        const countries = await engine.getCountries()
        console.log(`Found ${countries.length} countries.`)
        if (countries.length > 0) {
            console.log('First country:', countries[0])
        }
    } catch (error) {
        console.error('Error:', error)
    }
}

main()
    .finally(() => prisma.$disconnect())
