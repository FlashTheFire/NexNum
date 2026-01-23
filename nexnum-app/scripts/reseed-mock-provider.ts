import 'dotenv/config'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

const MOCK_PROVIDER_CONFIG = {
    name: 'mock-sms',
    displayName: 'Mock SMS Provider (Local)',
    description: 'Local simulation of SMS-Activate protocol for development and testing',
    websiteUrl: 'http://localhost:3000/api/mock-sms',
    apiBaseUrl: 'http://localhost:3000/api/mock-sms',

    // Auth Config
    authType: 'none',
    providerType: 'rest',

    // Business Logic
    isActive: true,
    priority: 100, // High priority for dev
    currency: 'USD',
    priceMultiplier: 1.0,

    // Endpoints Definition
    endpoints: {
        getBalance: {
            method: 'GET',
            path: '',
            queryParams: { action: 'getBalance' }
        },
        getCountries: {
            method: 'GET',
            path: '',
            queryParams: { action: 'getCountries' }
        },
        getServices: {
            method: 'GET',
            path: '',
            queryParams: { action: 'getServicesList' }
        },
        getPrices: {
            method: 'GET',
            path: '',
            queryParams: { action: 'getPrices', country: '{country}' } // Optional country filter
        },
        getNumber: {
            method: 'GET',
            path: '',
            queryParams: {
                action: 'getNumber',
                country: '{country}',
                service: '{service}'
            }
        },
        getStatus: {
            method: 'GET',
            path: '',
            queryParams: {
                action: 'getStatus',
                id: '{id}'
            }
        },
        setStatus: {
            method: 'GET',
            path: '',
            queryParams: {
                action: 'setStatus',
                id: '{id}',
                status: '{status}'
            }
        },
        cancelNumber: {
            method: 'GET',
            path: '',
            queryParams: {
                action: 'setStatus',
                id: '{id}',
                status: '8' // 8 = Cancel
            }
        }
    },

    // Response Mappings
    mappings: {
        getBalance: {
            type: 'text_regex',
            regex: 'ACCESS_BALANCE:([0-9.]+)',
            fields: { balance: '$1' }
        },
        getCountries: {
            type: 'json_dictionary',
            fields: {
                id: 'id',
                name: 'eng|rus|chn', // Fallback chain
                code: 'id' // Use ID as code
            }
        },
        getServices: {
            type: 'json_array',
            rootPath: 'services',
            fields: {
                code: 'code',
                name: 'name'
            }
        },
        getPrices: {
            type: 'json_nested_dictionary', // Handles country -> service -> price structure
            fields: {
                cost: 'cost',
                count: 'count'
            }
        },
        getNumber: {
            type: 'text_regex',
            regex: 'ACCESS_NUMBER:(\\d+):(\\d+)',
            fields: {
                activationId: '$1',
                phoneNumber: '$2'
            },
            errorPatterns: {
                'NO_NUMBERS': 'NO_NUMBERS',
                'no_numbers': 'NO_NUMBERS',
                'BAD_SERVICE': 'BAD_SERVICE'
            }
        },
        getStatus: {
            type: 'text_regex',
            // Matches: STATUS_WAIT_CODE, STATUS_OK:123, STATUS_WAIT_RETRY:123
            regex: '(STATUS_WAIT_CODE|STATUS_OK:([0-9A-Za-z]+)|STATUS_WAIT_RETRY:([0-9A-Za-z]+)|STATUS_CANCEL|ACCESS_CANCEL|ACCESS_READY|ACCESS_ACTIVATION)',
            fields: {
                rawStatus: '$1', // Full string
                code: '$2'       // Captured group 2 (for STATUS_OK)
            },
            statusMapping: {
                'STATUS_WAIT_CODE': 'pending',
                'STATUS_WAIT_RETRY': 'pending', // Pending next code
                'STATUS_OK': 'received',
                'STATUS_CANCEL': 'cancelled',
                'ACCESS_CANCEL': 'cancelled',
                'ACCESS_READY': 'pending',
                'ACCESS_ACTIVATION': 'completed'
            }
        },
        setStatus: {
            type: 'text_regex',
            regex: '(ACCESS_READY|ACCESS_ACTIVATION|ACCESS_CANCEL|ACCESS_RETRY_GET)',
            fields: { status: '$0' }
        },
        cancelNumber: {
            type: 'text_regex',
            regex: '(ACCESS_CANCEL|ACCESS_READY)',
            fields: { status: '$0' }
        }
    },

    // Enable Dynamic Features
    useDynamicMetadata: true,
    dynamicFunctions: ['getCountries', 'getServices', 'getPrices', 'getBalance']
}

async function main() {
    logger.info('SEEDING MOCK SMS PROVIDER...')

    const provider = await prisma.provider.upsert({
        where: { name: MOCK_PROVIDER_CONFIG.name },
        update: MOCK_PROVIDER_CONFIG,
        create: MOCK_PROVIDER_CONFIG
    })

    logger.info('✅ MOCK PROVIDER CONFIG SAVED', { id: provider.id })

    // Also verify it exists
    const check = await prisma.provider.findUnique({
        where: { name: 'mock-sms' }
    })

    console.log(JSON.stringify(check, null, 2))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
