
import 'dotenv/config'
import { prisma, ensureWallet, getUserBalance } from './db'
import { smsProvider } from './sms-providers'

async function testBuyFlow() {
    console.log('🛒 STARTING BUY FLOW TEST')
    // 1. SETUP: Fund Wallet (Find REAL user)
    const user = await prisma.user.findFirst()
    if (!user) {
        console.error('❌ No users found in DB. Cannot test wallet.')
        return
    }
    const userId = user.id
    console.log(`👤 Using Test User ID: ${userId}`)
    const walletId = await ensureWallet(userId)
    await prisma.walletTransaction.create({
        data: {
            walletId,
            amount: 100.00, // Grant $100
            type: 'deposit',
            description: 'Test Deposit'
        }
    })
    const balance = await getUserBalance(userId)
    console.log(`💰 Wallet Balance: $${balance.toFixed(2)}`)

    // 2. FIND PRODUCT: Get an available pricing
    // We prefer a cheap one for testing
    const pricing = await prisma.providerPricing.findFirst({
        where: {
            stock: { gt: 0 },
            deleted: false,
            // Try to find a real provider (grizzlysms or smsbower)
            provider: { name: { in: ['grizzlysms', 'smsbower', 'herosms'] } }
        },
        include: { provider: true, country: true, service: true },
        orderBy: { sellPrice: 'asc' }
    })

    if (!pricing) {
        console.error('❌ No stock available to test!')
        return
    }

    console.log(`🎯 Target: ${pricing.service.name} in ${pricing.country.name} ($${pricing.sellPrice}) via ${pricing.provider.name}`)

    // 3. SIMULATE PURCHASE (Simplified version of route.ts logic)
    try {
        console.log('🔄 Attempting purchase with provider...')
        // Note: Real purchase will consume balance and might fail if provider has no funds
        // We will TRY it. If it fails due to provider funds, that's still a valid test of flow.

        try {
            const result = await smsProvider.getNumber(
                pricing.country.externalId,
                pricing.service.externalId,
                pricing.provider.name
            )
            console.log('✅ PURCHASE SUCCESS!')
            console.log('   Phone:', result.phoneNumber)
            console.log('   ID:', result.activationId)
        } catch (e: any) {
            console.log(`⚠️ Provider API Error:`)
            console.log(e)
        }

    } catch (e) {
        console.error('❌ Transaction Failed:', e)
    }
}

testBuyFlow().catch(console.error).finally(() => prisma.$disconnect())
