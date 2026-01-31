/**
 * Master Seed Script
 * 
 * Consolidates all seeding logic into a single file as requested.
 * Handles: System Settings, Currencies, Providers, and Banned Icons.
 */

import 'dotenv/config'
import { prisma } from '../../src/lib/core/db'

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

const PROVIDERS = {
    '5sim': {
        name: '5sim',
        displayName: '5sim.net',
        description: 'Official v1 guest/user endpoints',
        baseUrl: 'https://5sim.net/v1',
        authType: 'bearer',
        providerType: 'rest',
        endpoints: {
            getCountriesList: { method: 'GET', path: 'https://5sim.net/v1/guest/countries' },
            getServicesList: { method: 'GET', path: 'https://5sim.net/v1/guest/products/any/any' },
            getNumber: {
                method: 'GET',
                path: 'https://5sim.net/v1/user/buy/activation/$country/$operator/$product',
                queryParams: {
                    forwarding: '$forwarding',
                    number: '$forwardingNumber',
                    reuse: '$reuse',
                    voice: '$voice',
                    ref: '$ref',
                    maxPrice: '$maxPrice'
                }
            },
            getStatus: { method: 'GET', path: 'https://5sim.net/v1/user/check/$id' },
            setCancel: { method: 'GET', path: 'https://5sim.net/v1/user/cancel/$id' },
            getBalance: { method: 'GET', path: 'https://5sim.net/v1/user/profile' },
            getPrices: {
                method: 'GET',
                path: 'https://5sim.net/v1/guest/prices',
                queryParams: { country: '$country', product: '$service' }
            }
        },
        mappings: {
            getCountriesList: {
                type: 'json_dictionary',
                fields: {
                    name: 'text_en|$key',
                    iso: 'iso.$firstKey',
                    prefix: 'prefix.$firstKey',
                    countryCode: '$key'
                }
            },
            getServicesList: {
                type: 'json_dictionary',
                fields: {
                    service: '$key',
                    category: 'Category',
                    count: 'Qty|count|stock',
                    cost: 'Price|cost|amount'
                }
            },
            getNumber: {
                type: 'json_object',
                fields: {
                    id: 'id',
                    phone: 'phone',
                    operator: 'operator',
                    service: 'product',
                    cost: 'pointPrice',
                    status: 'status',
                    expiresAt: 'expires',
                    country: 'country',
                    sms: 'sms'
                }
            },
            getStatus: {
                type: 'json_object',
                fields: {
                    id: 'id',
                    phone: 'phone',
                    operator: 'operator',
                    service: 'product',
                    cost: 'pointPrice',
                    status: 'status',
                    expiresAt: 'expires',
                    country: 'country',
                    sms: 'sms',
                    code: 'sms[0].code',
                    message: 'sms[0].text'
                },
                statusMapping: {
                    STATUS_WAIT_CODE: 'pending',
                    STATUS_WAIT_RETRY: 'pending',
                    STATUS_OK: 'received',
                    STATUS_CANCEL: 'cancelled',
                    ACCESS_CANCEL: 'cancelled',
                    ACCESS_READY: 'pending',
                    ACCESS_ACTIVATION: 'completed'
                }
            },
            setCancel: {
                type: 'json_object',
                fields: {
                    id: 'id',
                    phone: 'phone',
                    operator: 'operator',
                    service: 'product',
                    cost: 'pointPrice',
                    status: 'status',
                    expiresAt: 'expires',
                    country: 'country'
                }
            },
            getBalance: {
                type: 'json_object',
                fields: {
                    balance: 'balance',
                    id: 'id',
                    email: 'email',
                    rating: 'rating'
                }
            },
            getPrices: {
                type: 'json_dictionary',
                nestingLevels: { extractOperators: true },
                fields: {
                    cost: 'cost|price|amount|rate|value',
                    count: 'count|qty|stock|available|physicalCount',
                    operator: '$key',
                    service: '$parentKey',
                    country: '$grandParentKey'
                }
            }
        }
    },
    'herosms': {
        name: 'herosms',
        displayName: 'HeroSMS',
        description: 'SMS-Activate Compatible API (Strict Dynamic)',
        baseUrl: 'https://hero-sms.com/stubs/handler_api.php',
        authType: 'query_param',
        authQueryParam: 'api_key',
        providerType: 'hybrid',
        endpoints: {
            getCountriesList: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getCountries&api_key={authKey}' },
            getServicesList: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getServicesList&country={country}&lang=en&api_key={authKey}' },
            getNumber: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getNumber&service={service}&country={country}&api_key={authKey}' },
            getStatus: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getStatus&id={id}&api_key={authKey}' },
            setCancel: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=setStatus&id={id}&status=8&api_key={authKey}' },
            getBalance: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getBalance&api_key={authKey}' }
        },
        mappings: {
            getCountriesList: { type: 'json_array', rootPath: '$', fields: { id: 'id', name: 'eng', code: 'id' } },
            getServicesList: { type: 'json_array', rootPath: 'services', fields: { id: 'code', name: 'name', code: 'code' } },
            getNumber: { type: 'text_regex', regex: 'ACCESS_NUMBER:(\\d+):(\\d+)', fields: { id: '1', phone: '2', price: '0' } },
            getStatus: {
                type: 'text_regex',
                regex: 'STATUS_([A-Z_]+)(:?.*)?',
                fields: { status: '1', code: '2' },
                statusMapping: {
                    WAIT_CODE: 'pending',
                    WAIT_RETRY: 'pending',
                    OK: 'received',
                    CANCEL: 'cancelled'
                }
            },
            setCancel: { type: 'text_regex', regex: 'ACCESS_CANCEL', fields: { status: '0' } },
            getBalance: { type: 'text_regex', regex: 'ACCESS_BALANCE:([\\d.]+)', fields: { balance: '1' } }
        }
    }
}

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
            baseCurrency: 'USD',
            displayCurrency: 'USD',
            pointsEnabled: true,
            pointsName: 'Credits',
            pointsRate: 100.0,
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
