
// import { prisma } from '../src/lib/db'
import { DynamicProvider } from '../src/lib/dynamic-provider'
import * as dotenv from 'dotenv'

dotenv.config()

let prisma: any

async function main() {
    console.log('Loading database connection...')
    const db = await import('../src/lib/db')
    prisma = db.prisma

    console.log('Fetching provider config for 5sim...')
    const providerConfig = await prisma.provider.findUnique({
        where: { name: '5sim' }
    })

    if (!providerConfig) {
        throw new Error('Provider 5sim not found')
    }

    console.log('Initializing DynamicProvider...')
    const provider = new DynamicProvider(providerConfig)

    console.log('Testing getCountries()...')
    const countries = await provider.getCountries()
    console.log(`Found ${countries.length} countries`)
    if (countries.length > 0) {
        console.log('First country:', countries[0])
        console.log('Phone code:', countries[0].phoneCode)
    }

    // console.log('Testing getServices("usa")...')
    // const services = await provider.getServices('usa')
    // console.log(`Found ${services.length} services`)
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect()
    })
