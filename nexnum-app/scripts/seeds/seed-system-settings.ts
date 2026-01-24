/**
 * Seed: System Settings
 * 
 * Initializes default system configuration.
 * Idempotent - safe to run multiple times.
 */

import 'dotenv/config'
import { prisma } from '../../src/lib/core/db'

export async function seedSystemSettings() {
    console.log('⚙️ Seeding system settings...')

    const settings = await prisma.systemSettings.upsert({
        where: { id: 'default' },
        update: {}, // Don't overwrite existing settings
        create: {
            id: 'default',
            baseCurrency: 'USD',
            displayCurrency: 'POINTS',
            pointsEnabled: true,
            pointsName: 'Coins',
            pointsRate: 100.0, // 1 USD = 100 Coins
        },
    })

    console.log(`✅ System settings configured (ID: ${settings.id})`)
    return settings
}

// Run directly if executed as script
if (require.main === module) {
    seedSystemSettings()
        .then(() => prisma.$disconnect())
        .catch((e) => {
            console.error('❌ Seed failed:', e)
            prisma.$disconnect()
            process.exit(1)
        })
}
