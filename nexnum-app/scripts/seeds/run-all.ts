/**
 * Run All Seeds
 * 
 * Executes all seed scripts in the correct order.
 * Idempotent - safe to run multiple times.
 */

import 'dotenv/config'
import { prisma } from '../../src/lib/core/db'
import { seedCurrencies } from './seed-currencies'
import { seedSystemSettings } from './seed-system-settings'

async function runAllSeeds() {
    console.log('🌱 Starting production seed...\n')
    console.log('─'.repeat(40))

    try {
        // 1. System settings (foundational)
        await seedSystemSettings()
        console.log('')

        // 2. Currencies
        await seedCurrencies()
        console.log('')

        console.log('─'.repeat(40))
        console.log('🎉 All seeds completed successfully!')

    } catch (error) {
        console.error('\n❌ Seed process failed:')
        console.error(error)
        throw error
    }
}

runAllSeeds()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error(e)
        prisma.$disconnect()
        process.exit(1)
    })
