import 'dotenv/config'
import { prisma } from '../lib/core/db'
import { encrypt } from '../lib/security/encryption'

async function activate() {
    const providerName = 'grizzlysms'
    const apiKey = process.env.GRIZZLY_API_KEY
    console.log(`🚀 [ACTIVATE] Target: ${providerName}`)

    if (!apiKey) {
        console.warn('⚠️ No GRIZZLY_API_KEY found in .env. Auth key will not be updated.')
    }

    const config = {
        name: providerName,
        displayName: 'Grizzly SMS',
        description: 'GrizzlySMS Provider with Dynamic Mappings',
        isActive: true,
        priority: 1,
        apiBaseUrl: 'https://api.grizzlysms.com/stubs/handler_api.php',
        websiteUrl: 'https://grizzlysms.com',

        // Auth Config
        authType: 'query_param',
        authQueryParam: 'api_key',
        ...(apiKey ? { authKey: encrypt(apiKey) } : {}),

        // Endpoints
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
            // Special endpoint for services list from their main site API
            getServices: {
                method: 'GET',
                path: 'https://grizzlysms.com/api/service',
                queryParams: {
                    'per-page': '10000',
                    'page': '1'
                }
            },
            getPrices: {
                method: 'GET',
                path: '',
                queryParams: {
                    action: 'getPrices',
                    country: '$country', // Dynamic variable
                    service: '$service'  // Dynamic variable
                }
            },
            getNumber: {
                method: 'GET',
                path: '',
                queryParams: {
                    action: 'getNumber',
                    country: '$country',
                    service: '$service',
                    maxPrice: '$maxPrice'
                }
            },
            getStatus: {
                method: 'GET',
                path: '',
                queryParams: {
                    action: 'getStatus',
                    id: '$id'
                }
            },
            setStatus: {
                method: 'GET',
                path: '',
                queryParams: {
                    action: 'setStatus',
                    id: '$id',
                    status: '$status'
                }
            },
            cancelNumber: {
                method: 'GET',
                path: '',
                queryParams: {
                    action: 'setStatus',
                    id: '$id',
                    status: '8' // Standard Cancel Status
                }
            }
        },

        // Mappings
        mappings: {
            getBalance: {
                type: 'text_regex',
                regex: 'ACCESS_BALANCE:([0-9.]+)',
                fields: { balance: '1' },
                transform: { balance: 'number' }
            },
            getCountries: {
                type: 'json_dictionary',
                fields: {
                    id: 'id|$key',
                    name: 'eng|rus|chn', // Fallback to english
                    countryCode: '$key'
                },
                transform: {
                    id: 'string',
                    name: 'trim'
                }
            },
            getServices: {
                type: 'json_array',
                fields: {
                    id: 'id', // Keep original ID (e.g. 62)
                    name: 'name', // e.g. "Whatsapp"
                    code: 'slug' // Use slug as the code (e.g. "whatsapp")
                },
                transform: {
                    id: 'string',
                    name: 'trim'
                }
            },
            getPrices: {
                type: 'json_dictionary',
                nestingLevels: {
                    extractOperators: true,
                    depth: 3
                },
                fields: {
                    country: '$grandParentKey',
                    service: '$parentKey',
                    cost: '$key',
                    count: '$value'
                },
                transform: {
                    cost: 'number',
                    count: 'number',
                    country: 'string',
                    service: 'string'
                }
            },
            getNumber: {
                type: 'text_regex',
                regex: 'ACCESS_NUMBER:(\\d+):(\\d+)',
                fields: {
                    activationId: '1',
                    phoneNumber: '2'
                },
                errorPatterns: {
                    'NO_NUMBERS': 'NO_NUMBERS',
                    'NO_BALANCE': 'NO_BALANCE',
                    'BAD_SERVICE': 'BAD_SERVICE'
                }
            },
            getStatus: {
                type: 'text_regex',
                // Matches: STATUS_WAIT_CODE, STATUS_OK:123, STATUS_WAIT_RETRY:123
                regex: '(STATUS_WAIT_CODE|STATUS_OK:([0-9A-Za-z]+)|STATUS_WAIT_RETRY:([0-9A-Za-z]+)|STATUS_CANCEL|ACCESS_CANCEL|ACCESS_READY|ACCESS_ACTIVATION)',
                fields: {
                    rawStatus: '1', // Full string
                    code: '2'       // Captured group 2 (for STATUS_OK)
                },
                statusMapping: {
                    'STATUS_WAIT_CODE': 'pending',
                    'STATUS_WAIT_RETRY': 'pending',
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
                fields: { status: '0' }
            },
            cancelNumber: {
                type: 'text_regex',
                regex: '(ACCESS_CANCEL|ACCESS_READY)',
                fields: { status: '0' }
            }
        }
    }

    try {
        const provider = await prisma.provider.upsert({
            where: { name: providerName },
            update: config,
            create: config
        })

        console.log(`✅ [ACTIVATE] Success: ${provider.name} (ID: ${provider.id}) is now ACTIVE.`)
    } catch (error: any) {
        console.error(`❌ [ACTIVATE] Failure:`, error.message)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

activate()
