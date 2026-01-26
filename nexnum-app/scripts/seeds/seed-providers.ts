/**
 * Seed: Provider Configurations (Strict Dynamic/REST)
 * 
 * Replaces default provider configurations with strict JSON-based mappings.
 * Removes all old flags and ensures compatibility with the new Dynamic Engine.
 */

import 'dotenv/config'
import { prisma } from '../../src/lib/core/db'

const PROVIDERS = {
    '5sim': {
        name: '5sim',
        displayName: '5sim.net',
        description: 'Official v1 guest/user endpoints',
        baseUrl: 'https://5sim.net/v1',
        authType: 'bearer',
        providerType: 'rest',
        endpoints: {
            getCountries: { method: 'GET', path: 'https://5sim.net/v1/guest/countries' },
            getServices: { method: 'GET', path: 'https://5sim.net/v1/guest/products/any/any' },
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
            cancelNumber: { method: 'GET', path: 'https://5sim.net/v1/user/cancel/$id' },
            getBalance: { method: 'GET', path: 'https://5sim.net/v1/user/profile' },
            getPrices: {
                method: 'GET',
                path: 'https://5sim.net/v1/guest/prices',
                queryParams: { country: '$country', product: '$service' }
            }
        },
        mappings: {
            getCountries: {
                type: 'json_dictionary',
                fields: {
                    name: 'text_en|$key',
                    iso: 'iso.$firstKey',
                    prefix: 'prefix.$firstKey',
                    countryCode: '$key'
                }
            },
            getServices: {
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
                    cost: 'price',
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
                    cost: 'price',
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
            cancelNumber: {
                type: 'json_object',
                fields: {
                    id: 'id',
                    phone: 'phone',
                    operator: 'operator',
                    service: 'product',
                    cost: 'price',
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
        authType: 'query_param', // Still uses query param auth, but handled via compatibility mode
        authQueryParam: 'api_key',
        providerType: 'hybrid', // Mark as hybrid for frontend compatibility switch
        endpoints: {
            getCountries: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getCountries&api_key={authKey}' },
            getServices: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getServicesList&country={country}&lang=en&api_key={authKey}' },
            getNumber: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getNumber&service={service}&country={country}&api_key={authKey}' },
            getStatus: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getStatus&id={id}&api_key={authKey}' },
            cancelNumber: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=setStatus&id={id}&status=8&api_key={authKey}' },
            getBalance: { method: 'GET', path: 'https://hero-sms.com/stubs/handler_api.php?action=getBalance&api_key={authKey}' }
        },
        mappings: {
            getCountries: { type: 'json_array', rootPath: '$', fields: { id: 'id', name: 'eng', code: 'id' } },
            getServices: { type: 'json_array', rootPath: 'services', fields: { id: 'code', name: 'name', code: 'code' } },
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
            cancelNumber: { type: 'text_regex', regex: 'ACCESS_CANCEL', fields: { status: '0' } },
            getBalance: { type: 'text_regex', regex: 'ACCESS_BALANCE:([\\d.]+)', fields: { balance: '1' } }
        }
    }
}

export async function seedProviders() {
    console.log('🔌 Seeding strict provider configurations...')

    for (const [key, config] of Object.entries(PROVIDERS)) {
        await prisma.provider.upsert({
            where: { name: config.name },
            update: {
                // Force update crucial dynamic configs
                mappings: config.mappings,
                endpoints: config.endpoints,
                providerType: config.providerType,
                displayName: config.displayName,
                description: config.description
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
            }
        })
        console.log(`✅ Configured ${config.displayName}`)
    }
}

// Run directly
if (require.main === module) {
    seedProviders()
        .then(() => prisma.$disconnect())
        .catch((e) => {
            console.error('❌ Provider seed failed:', e)
            prisma.$disconnect()
            process.exit(1)
        })
}
