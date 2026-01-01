
/**
 * Provider Seed Script - Advanced Configurations
 * 
 * Each provider has carefully crafted endpoint and mapping configurations
 * that handle their specific API response formats.
 */

import * as dotenv from 'dotenv'
dotenv.config()

const PROVIDERS = [
    // =========================================================================
    // 5SIM - REST API with Dictionary responses
    // Docs: https://5sim.net/v1/api
    // =========================================================================
    {
        name: '5sim',
        displayName: '5sim',
        description: 'Global SMS verification service with 180+ countries. RESTful API.',
        logoUrl: '/providers/5sim.png',
        websiteUrl: 'https://5sim.net',
        apiBaseUrl: 'https://5sim.net/v1',
        authType: 'bearer',
        authHeader: 'Authorization',
        authKey: process.env.FIVESIM_API_KEY,
        endpoints: {
            getCountries: { method: 'GET', path: '/guest/countries' },
            getServices: { method: 'GET', path: '/guest/products/{country}/any' },
            getNumber: { method: 'GET', path: '/user/buy/activation/{country}/any/{service}' },
            getStatus: { method: 'GET', path: '/user/check/{id}' },
            cancelNumber: { method: 'GET', path: '/user/cancel/{id}' },
            getBalance: { method: 'GET', path: '/user/profile' },
        },
        mappings: {
            // Response: { "afghanistan": { "iso": { "1": "af" }, "text_en": "Afghanistan", "prefix": { "93": "93" } }, ... }
            getCountries: {
                type: 'json_dictionary',
                fields: {
                    id: 'iso.$firstValue',
                    name: 'text_en',
                    code: '$key',
                    phoneCode: 'prefix.$firstKey'
                }
            },
            // Response: { "service_name": { "cost": 5, "count": 100 }, ... }
            getServices: {
                type: 'json_dictionary',
                fields: {
                    id: '$key',
                    name: '$key',
                    code: '$key',
                    price: 'cost',
                    count: 'count'
                }
            },
            getNumber: {
                type: 'json_object',
                fields: { id: 'id', phone: 'phone', price: 'price' }
            },
            getBalance: {
                type: 'json_object',
                fields: { balance: 'balance' }
            },
            getStatus: {
                type: 'json_object',
                fields: { status: 'status', sms: 'sms' }
            }
        },
        isActive: true,
        priority: 10
    },

    // =========================================================================
    // HeroSMS - SMS-Activate compatible API
    // Uses action= query params, returns JSON with 'countries' array
    // =========================================================================
    {
        name: 'herosms',
        displayName: 'HeroSMS',
        description: 'Reliable SMS activations with competitive prices.',
        websiteUrl: 'https://hero-sms.com',
        apiBaseUrl: 'https://hero-sms.com/stubs/handler_api.php',
        authType: 'query_param',
        authQueryParam: 'api_key',
        authKey: process.env.HERO_SMS_API_KEY,
        endpoints: {
            getCountries: { method: 'GET', path: '', queryParams: { action: 'getCountries', lang: 'en' } },
            getServices: { method: 'GET', path: '', queryParams: { action: 'getServicesList', lang: 'en' } },
            getNumber: { method: 'GET', path: '', queryParams: { action: 'getNumber' } },
            getStatus: { method: 'GET', path: '', queryParams: { action: 'getStatus' } },
            cancelNumber: { method: 'GET', path: '', queryParams: { action: 'setStatus', status: '8' } },
        },
        mappings: {
            // Response: { "0": { "id": "0", "rus": "Russia", "eng": "Russia", ... }, "1": { ... } }
            // OR: { "countries": { "0": {...}, "1": {...} } }
            getCountries: {
                type: 'json_dictionary',
                fields: {
                    id: 'id',
                    name: 'eng',
                    code: 'id'
                }
            },
            // Response: { "0": { "name": "vk", "cost": 10 }, ... }
            getServices: {
                type: 'json_dictionary',
                fields: {
                    id: '$key',
                    name: 'name',
                    code: '$key',
                    price: 'cost'
                }
            },
            // Response: "ACCESS_NUMBER:id:phone" (text)
            getNumber: {
                type: 'text_regex',
                regex: 'ACCESS_NUMBER:(\\d+):(\\d+)',
                fields: { id: '1', phone: '2' }
            },
            // Response: "STATUS_OK:code" or "STATUS_WAIT_CODE"
            getStatus: {
                type: 'text_regex',
                regex: 'STATUS_([A-Z_]+):?(.*)?',
                fields: { status: '1', code: '2' }
            }
        },
        isActive: true,
        priority: 8
    },

    // =========================================================================
    // SMSBower - SMS-Activate compatible
    // =========================================================================
    {
        name: 'smsbower',
        displayName: 'SMSBower',
        description: 'Affordable virtual numbers for all platforms.',
        websiteUrl: 'https://smsbower.online',
        apiBaseUrl: 'https://smsbower.online/stubs/handler_api.php',
        authType: 'query_param',
        authQueryParam: 'api_key',
        authKey: process.env.SMSBOWER_API_KEY,
        endpoints: {
            getCountries: { method: 'GET', path: '', queryParams: { action: 'getCountries' } },
            getServices: { method: 'GET', path: '', queryParams: { action: 'getServices' } },
            getNumber: { method: 'GET', path: '', queryParams: { action: 'getNumber' } },
            getStatus: { method: 'GET', path: '', queryParams: { action: 'getStatus' } },
            cancelNumber: { method: 'GET', path: '', queryParams: { action: 'setStatus', status: '8' } },
            getBalance: { method: 'GET', path: '', queryParams: { action: 'getBalance' } },
        },
        mappings: {
            // Response: { "0": { "id": 0, "rus": "Россия", "eng": "Russia" }, ... }
            getCountries: {
                type: 'json_dictionary',
                fields: {
                    id: 'id',
                    name: 'eng',
                    code: 'id'
                }
            },
            getServices: {
                type: 'json_dictionary',
                fields: {
                    id: '$key',
                    name: 'name',
                    code: '$key',
                    price: 'price'
                }
            },
            // Response: "ACCESS_NUMBER:id:phone"
            getNumber: {
                type: 'text_regex',
                regex: 'ACCESS_NUMBER:(\\d+):(\\d+)',
                fields: { id: '1', phone: '2' }
            },
            getStatus: {
                type: 'text_regex',
                regex: 'STATUS_([A-Z_]+):?(.*)?',
                fields: { status: '1', code: '2' }
            },
            // Response: "ACCESS_BALANCE:123.45"
            getBalance: {
                type: 'text_regex',
                regex: 'ACCESS_BALANCE:([\\d.]+)',
                fields: { balance: '1' }
            }
        },
        isActive: true,
        priority: 7
    },

    // =========================================================================
    // GrizzlySMS - Clean REST API with JSON arrays
    // =========================================================================
    {
        name: 'grizzlysms',
        displayName: 'GrizzlySMS',
        description: 'Premium SMS verification with high success rates.',
        websiteUrl: 'https://grizzlysms.com',
        apiBaseUrl: 'https://api.grizzlysms.com/stubs/handler_api.php',
        authType: 'query_param',
        authQueryParam: 'api_key',
        authKey: process.env.GRIZZLYSMS_API_KEY,
        endpoints: {
            getCountries: { method: 'GET', path: '', queryParams: { action: 'getCountries' } },
            getServices: { method: 'GET', path: '', queryParams: { action: 'getServices' } },
            getNumber: { method: 'GET', path: '', queryParams: { action: 'getNumber' } },
            getStatus: { method: 'GET', path: '', queryParams: { action: 'getStatus' } },
            cancelNumber: { method: 'GET', path: '', queryParams: { action: 'setStatus', status: '8' } },
            getBalance: { method: 'GET', path: '', queryParams: { action: 'getBalance' } },
        },
        mappings: {
            // Response: { "0": {"id": 0, "rus": "Россия", ...}, ... }
            getCountries: {
                type: 'json_dictionary',
                fields: {
                    id: 'id',
                    name: 'eng',
                    code: 'id',
                    phoneCode: 'phone_code'
                }
            },
            getServices: {
                type: 'json_dictionary',
                fields: {
                    id: '$key',
                    name: 'name',
                    code: '$key',
                    price: 'price'
                }
            },
            getNumber: {
                type: 'text_regex',
                regex: 'ACCESS_NUMBER:(\\d+):(\\d+)',
                fields: { id: '1', phone: '2' }
            },
            getStatus: {
                type: 'text_regex',
                regex: 'STATUS_([A-Z_]+):?(.*)?',
                fields: { status: '1', code: '2' }
            },
            getBalance: {
                type: 'text_regex',
                regex: 'ACCESS_BALANCE:([\\d.]+)',
                fields: { balance: '1' }
            }
        },
        isActive: !!process.env.GRIZZLYSMS_API_KEY,
        priority: 9
    },

    // =========================================================================
    // OnlineSIM - Mixed JSON API
    // =========================================================================
    {
        name: 'onlinesim',
        displayName: 'OnlineSIM',
        description: 'Virtual numbers with global coverage and aggregation.',
        websiteUrl: 'https://onlinesim.io',
        apiBaseUrl: 'https://onlinesim.io/api',
        authType: 'query_param',
        authQueryParam: 'apikey',
        authKey: process.env.ONLINESIM_API_KEY,
        endpoints: {
            getCountries: { method: 'GET', path: '/getFreeCountryList.php' },
            getServices: { method: 'GET', path: '/getNumbersStats.php' },
            getNumber: { method: 'GET', path: '/getNum.php' },
            getStatus: { method: 'GET', path: '/getState.php' },
            cancelNumber: { method: 'GET', path: '/setOperationRevise.php' },
            getBalance: { method: 'GET', path: '/getBalance.php' }
        },
        mappings: {
            // Response: { "response": 1, "countries": [ { "country": 1, "country_text": "Russia" }, ... ] }
            getCountries: {
                type: 'json_array',
                rootPath: 'countries',
                fields: {
                    id: 'country',
                    name: 'country_text',
                    code: 'country'
                }
            },
            // Response: { "services": { "telegram": { "count": 100, "price": 5 }, ... } }
            getServices: {
                type: 'json_dictionary',
                rootPath: 'services',
                fields: {
                    id: '$key',
                    name: '$key',
                    code: '$key',
                    price: 'price',
                    count: 'count'
                }
            },
            getNumber: {
                type: 'json_object',
                fields: { id: 'tzid', phone: 'number' }
            },
            getStatus: {
                type: 'json_object',
                fields: { status: 'response', code: 'msg' }
            },
            getBalance: {
                type: 'json_object',
                fields: { balance: 'balance' }
            }
        },
        isActive: !!process.env.ONLINESIM_API_KEY,
        priority: 6
    }
]


let prisma: any

async function main() {
    console.log('Loading database connection...')
    const db = await import('../src/lib/db')
    prisma = db.prisma

    console.log('Seeding providers with advanced configurations...')

    for (const p of PROVIDERS) {
        console.log(`Processing ${p.displayName}...`)

        const existing = await prisma.provider.findUnique({ where: { name: p.name } })

        const data = {
            name: p.name,
            displayName: p.displayName,
            description: p.description,
            logoUrl: p.logoUrl,
            websiteUrl: p.websiteUrl,
            apiBaseUrl: p.apiBaseUrl,
            authType: p.authType,
            authHeader: p.authHeader,
            authQueryParam: p.authQueryParam,
            authKey: p.authKey || null,
            endpoints: JSON.parse(JSON.stringify(p.endpoints)),
            mappings: JSON.parse(JSON.stringify(p.mappings)),
            isActive: p.isActive,
            priority: p.priority
        }

        try {
            if (existing) {
                await prisma.provider.update({
                    where: { id: existing.id },
                    data
                })
                console.log(`✓ Updated ${p.name}`)
            } else {
                await prisma.provider.create({ data })
                console.log(`✓ Created ${p.name}`)
            }
        } catch (err: any) {
            console.error(`✗ Failed ${p.name}:`, err.message)
        }
    }

    console.log('\n✅ Provider seeding complete!')
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        if (prisma) await prisma.$disconnect()
    })
