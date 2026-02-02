/**
 * Master Seed Script
 * 
 * Consolidates all seeding logic into a single file as requested.
 * Handles: System Settings, Currencies, Providers, and Banned Icons.
 */

import 'dotenv/config'
import { prisma } from '../../src/lib/core/db'
import * as fs from 'fs'
import * as path from 'path'

// Load providers from centralized config
const PROVIDERS_PATH = path.join(__dirname, '../config/templates/providers.json')
const PROVIDERS = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf-8')) as Record<string, any>

// ==========================================
// 1. DATA DEFINITIONS
// ==========================================

const CURRENCIES = [
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1.0, isBase: true },
    { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92, isBase: false },
    { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.79, isBase: false },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 83.0, isBase: false },
    { code: 'RUB', name: 'Russian Ruble', symbol: '₽', rate: 90.0, isBase: false },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', rate: 7.2, isBase: false },
]

const BANNED_HASHES = [
    {
        hash: 'be311539f1b49d644e5a70c1f0023c05a7eebabd282287305e8ca49587087702',
        description: 'Bad Bear Icon'
    }
]

// Providers are loaded from src/config/templates/providers.json

// ==========================================
// 2. SEED FUNCTIONS
// ==========================================

export async function seedSystemSettings() {
    console.log('⚙️ Seeding system settings...')

    const settings = await prisma.systemSettings.upsert({
        where: { id: 'default' },
        update: {},
        create: {
            id: 'default',
            // Currency Settings
            baseCurrency: 'USD',
            displayCurrency: 'USD',
            pointsEnabled: true,
            pointsName: 'Credits',
            pointsRate: 100.0,

            // Payment Gateway Settings (defaults)
            paymentsEnabled: false,          // Disabled by default, admin must enable
            upiProviderMode: 'DISABLED',     // No provider active initially

            // 3rd Party UPI Gateway (empty - must configure via admin)
            upiApiToken: null,
            upiCreateOrderUrl: null,
            upiCheckStatusUrl: null,
            upiQrBaseUrl: null,

            // Direct Paytm (empty - must configure via admin)
            paytmMerchantId: null,
            paytmMerchantKey: null,
            paytmWebsite: null,
            paytmIndustryType: null,
            paytmChannelId: null,
            paytmCallbackUrl: null,
            paytmEnvironment: 'STAGING',

            // Transaction Limits
            depositMinAmount: 10,
            depositMaxAmount: 50000,
            depositTimeoutMins: 30,
            maxPendingDeposits: 3,

            // Deposit Bonus
            depositBonusPercent: 0,          // No bonus by default
        },
    })

    console.log(`✅ System settings configured (ID: ${settings.id})`)

    // --- CHAIN OTHER SEEDS ---
    await seedCurrenciesInternal()
    await seedProvidersInternal()
    await seedBannedIconsInternal()

    return settings
}

// Internal Helper Functions (Formerly separate files)

async function seedCurrenciesInternal() {
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
                autoUpdate: cur.code !== 'USD',
            },
        })
        console.log(`  ✓ ${cur.code} (${cur.name})`)
    }
}

async function seedProvidersInternal() {
    console.log('🔌 Seeding strict provider configurations...')
    for (const [key, config] of Object.entries(PROVIDERS)) {
        await prisma.provider.upsert({
            where: { name: config.name },
            update: {
                mappings: config.mappings,
                endpoints: config.endpoints,
                providerType: config.providerType,
                displayName: config.displayName,
                description: config.description,
                isActive: true
            },
            create: {
                name: config.name,
                displayName: config.displayName,
                description: config.description,
                apiBaseUrl: config.baseUrl,
                authType: config.authType,
                authQueryParam: (config as any).authQueryParam,
                providerType: config.providerType,
                endpoints: config.endpoints,
                mappings: config.mappings,
                isActive: true
            }
        })
        console.log(`✅ Configured ${config.displayName}`)
    }
}

async function seedBannedIconsInternal() {
    console.log('🚫 Seeding banned icons...')
    for (const item of BANNED_HASHES) {
        try {
            await prisma.bannedIcon.upsert({
                where: { hash: item.hash },
                create: item,
                update: item
            })
            console.log(`  ✓ Banned: ${item.description}`)
        } catch (e) {
            console.warn(`  ⚠️ Failed to sync ${item.description}:`, e)
        }
    }
}

// Run directly if executed as script
if (require.main === module) {
    seedSystemSettings()
        .then(() => prisma.$disconnect())
        .catch((e) => {
            console.error('❌ Seed failed:', JSON.stringify(e, null, 2))
            prisma.$disconnect()
            process.exit(1)
        })
}
