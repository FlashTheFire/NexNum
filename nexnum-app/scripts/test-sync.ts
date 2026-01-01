
import * as dotenv from 'dotenv'
dotenv.config()

async function main() {
    console.log('Testing syncProviderData("5sim")...')

    // Dynamic import to ensure dotenv is loaded first
    // Note: We import from src/lib/provider-sync which imports DB
    const { syncProviderData } = await import('../src/lib/provider-sync')

    try {
        const result = await syncProviderData('5sim')
        console.log('Sync Result:', JSON.stringify(result, null, 2))
    } catch (e) {
        console.error('Sync failed:', e)
        process.exit(1)
    }
}

main()
    .catch(console.error)
    .finally(() => {
        import('../src/lib/db').then(m => m.prisma.$disconnect())
    })
