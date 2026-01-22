// Force reload of Prisma Client types
import 'dotenv/config'
import { prisma } from './src/lib/core/db'

async function run() {
    try {
        console.log("Seeding Currency and SystemSettings...")

        // 1. Initial System Settings
        // @ts-ignore - Prisma linter sync issue
        const settings = await prisma.systemSettings.upsert({
            where: { id: 'default' },
            update: {},
            create: {
                id: 'default',
                baseCurrency: 'USD',         // USD as the technical anchor for API rates
                displayCurrency: 'POINTS',   // Default display for everyone
                pointsEnabled: true,
                pointsName: 'Coins',
                pointsRate: 100.0            // 1 USD = 100 Coins
            }
        })
        console.log("SystemSettings Seeded:", settings.id)

        // 2. Initial Currencies (rates relative to 1 USD)
        const commonCurrencies = [
            { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1.0, isBase: true },
            { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 83.0, isBase: false },
            { code: 'RUB', name: 'Russian Ruble', symbol: '₽', rate: 90.0, isBase: false },
            { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92, isBase: false }
        ]

        for (const cur of commonCurrencies) {
            // @ts-ignore - Prisma linter sync issue
            await prisma.currency.upsert({
                where: { code: cur.code },
                update: {
                    name: cur.name,
                    symbol: cur.symbol,
                    rate: cur.rate,
                    isBase: cur.isBase
                },
                create: {
                    code: cur.code,
                    name: cur.name,
                    symbol: cur.symbol,
                    rate: cur.rate,
                    isBase: cur.isBase,
                    isActive: true,
                    autoUpdate: true
                }
            })
        }
        console.log("Currencies Seeded successfully.")

    } catch (e) {
        console.error("Seeding failed:")
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}

run()
