/**
 * Test Script: GrizzlySMS Integration Verification
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { GrizzlySmsProvider } from './sms-providers/grizzlysms'

async function verifyIntegration() {
    console.log('='.repeat(70))
    console.log('🧪 VERIFYING GRIZZLYSMS INTEGRATION (HANDLER API)')
    console.log('='.repeat(70))

    const provider = new GrizzlySmsProvider()
    const checkCodes = ['acx', 'aco', 'acp', 'act']

    console.log('\nCalling provider.getServices("")...')
    try {
        const services = await provider.getServices('')
        console.log(`✅ Fetched ${services.length} services via Class`)

        let foundCount = 0
        services.forEach(s => {
            if (checkCodes.includes(s.code)) {
                console.log(`   ✅ FOUND: ${s.code} -> "${s.name}"`)
                foundCount++
            }
        })

        if (foundCount === 0) {
            console.log('❌ None of the target codes found!')
        } else {
            console.log(`\n🎉 Success! Found ${foundCount}/${checkCodes.length} target services.`)
        }

    } catch (e) {
        console.log(`❌ FAILED: ${e}`)
    }
}

verifyIntegration().catch(console.error)
