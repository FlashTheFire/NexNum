
import 'dotenv/config'
import { meili, INDEXES, indexOffers, waitForTask } from '../src/lib/search'
import { OfferDocument } from '../src/lib/search'

async function testNormalization() {
    console.log('🧪 Testing Smart Service Normalization...')

    // 1. Prepare Test Data (Mixed variations)
    const testOffers: OfferDocument[] = [
        {
            id: 'test_grizzly_tg',
            provider: 'Grizzly',
            displayName: 'Grizzly SMS',
            countryCode: 'us',
            countryName: 'USA',
            // VARIATION 1: "tg"
            serviceSlug: 'tg',
            serviceName: 'Telegram',
            flagUrl: '',
            operatorId: 1,
            operatorDisplayName: '',
            price: 1.50,
            stock: 100,
            lastSyncedAt: Date.now()
        },
        {
            id: 'test_5sim_telegram',
            provider: '5sim',
            displayName: '5sim',
            countryCode: 'us',
            countryName: 'USA',
            // VARIATION 2: "telegram" (canonical)
            serviceSlug: 'telegram',
            serviceName: 'Telegram Messenger',
            flagUrl: '',
            operatorId: 2,
            operatorDisplayName: '',
            price: 1.20,
            stock: 50,
            lastSyncedAt: Date.now()
        },
        {
            id: 'test_other_tele',
            provider: 'Other',
            displayName: 'Other',
            countryCode: 'us',
            countryName: 'USA',
            // VARIATION 3: "tele"
            serviceSlug: 'tele',
            serviceName: 'Tele App',
            flagUrl: '',
            operatorId: 3,
            operatorDisplayName: '',
            price: 1.80,
            stock: 20,
            lastSyncedAt: Date.now()
        }
    ]

    console.log(`📝 Indexing ${testOffers.length} offers with mixed slugs: "tg", "telegram", "tele"...`)

    // 2. Run Indexing (This triggers the normalization logic)
    const taskUid = await indexOffers(testOffers)

    if (taskUid) {
        // Wait for MeiliSearch to process using built-in helper
        console.log(`⏳ Waiting for task ${taskUid} to complete...`)
        await waitForTask(taskUid)
    } else {
        console.error('❌ Indexing failed to return a task UID.')
        process.exit(1)
    }

    // 3. Verify Results
    const index = meili.index(INDEXES.OFFERS)

    // Fetch the documents back individually
    const storedDocs = []
    for (const offer of testOffers) {
        try {
            const doc = await index.getDocument(offer.id)
            storedDocs.push(doc)
        } catch (e) {
            console.error(`❌ Failed to fetch doc ${offer.id}:`, e)
        }
    }

    console.log('\n🔍 Verification Results:')
    let allPassed = true

    storedDocs.forEach((doc: any) => {
        const original = testOffers.find(o => o.id === doc.id)
        console.log(`\n📄 Doc ID: ${doc.id}`)
        console.log(`   Original Slug: "${original?.serviceSlug}"`)
        console.log(`   Stored Slug:   "${doc.serviceSlug}"`) // Should be 'telegram'

        if (doc.serviceSlug === 'telegram') {
            console.log('   ✅ PASSED (Normalized)')
        } else {
            console.log('   ❌ FAILED (Not Normalized)')
            allPassed = false
        }
    })

    console.log('\n-----------------------------------')
    if (allPassed) {
        console.log('✅ SUCCESS: All variations normalized to "telegram"!')
    } else {
        console.error('❌ FAILURE: distinct slugs found.')
        process.exit(1)
    }

    // Cleanup
    console.log('🧹 Cleaning up test data...')
    await index.deleteDocuments(testOffers.map(o => o.id))
}

testNormalization()
