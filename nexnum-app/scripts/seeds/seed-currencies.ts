/**
 * Seed: Currencies
 * 
 * Initializes base currencies for the platform.
 * Idempotent - safe to run multiple times.
 */

import 'dotenv/config'
import { prisma } from '../../src/lib/core/db'

const CURRENCIES = [
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1.0, isBase: true },
    { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92, isBase: false },
    { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.79, isBase: false },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 83.0, isBase: false },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽', rate: 90.0, isBase: false },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', rate: 7.2, isBase: false },
]

export async function seedCurrencies() {
    console.log('📦 Seeding currencies...')

    for (const cur of CURRENCIES) {
        await prisma.currency.upsert({
            where: { code: cur.code },
            update: {
                name: cur.name,
                symbol: cur.symbol,
                rate: cur.rate,
                isBase: cur.isBase,
            },
            create: {
                code: cur.code,
                name: cur.name,
                symbol: cur.symbol,
                rate: cur.rate,
                isBase: cur.isBase,
                isActive: true,
                autoUpdate: cur.code !== 'USD', // Auto-update non-base currencies
            },
        })
        console.log(`  ✓ ${cur.code} (${cur.name})`)
    }

    console.log(`✅ Seeded ${CURRENCIES.length} currencies`)
}

// Run directly if executed as script
if (require.main === module) {
    seedCurrencies()
        .then(() => prisma.$disconnect())
        .catch((e) => {
            console.error('❌ Seed failed:', e)
            prisma.$disconnect()
            process.exit(1)
        })
}
