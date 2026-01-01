
import { DynamicProvider } from '../src/lib/dynamic-provider'
import { Provider } from '@prisma/client'

// Mock provider config with Named Capture Groups
const mockConfig: Provider = {
    id: 'test-provider',
    name: 'test-provider',
    type: 'dynamic',
    apiBaseUrl: 'http://mock.api',
    authType: 'query_param',
    authKey: '123',
    endpoints: {
        getNumber: { method: 'GET', path: '/getNumber' }
    },
    mappings: {
        getNumber: {
            type: 'text_regex',
            regex: 'ACCESS_NUMBER:(?<id>\\d+):(?<phone>\\d+)', // Named groups
            fields: {
                id: 'id',       // Maps to group 'id'
                phone: 'phone'  // Maps to group 'phone'
            }
        },
        getBalance: {
            type: 'text_regex',
            regex: 'ACCESS_BALANCE:(?<balance>[\\d.]+)',
            fields: { balance: 'balance' }
        },
        legacyStatus: {
            type: 'text_regex',
            regex: 'STATUS_(\\d+)', // Legacy numbered group
            fields: { status: '1' } // Maps to group 1
        }
    },
    displayName: 'Test Provider',
    description: null,
    website: null,
    logoUrl: null,
    authHeader: null,
    authQueryParam: null,
    balance: 0,
    currency: 'USD',
    minBalance: 0,
    markupPercent: 0,
    priority: 0,
    isEnabled: true,
    lastBalanceSync: null,
    createdAt: new Date(),
    updatedAt: new Date()
} as unknown as Provider

async function test() {
    console.log('--- Testing Named Capture Groups ---')
    const provider = new DynamicProvider(mockConfig)

    // Test 1: Named Groups
    console.log('Test 1: Named Groups (getNumber)')
    // @ts-ignore - Accessing private method for testing
    const res1 = provider.parseTextResponse('ACCESS_NUMBER:12345:9876543210', mockConfig.mappings['getNumber'])
    console.log('Input: ACCESS_NUMBER:12345:9876543210')
    console.log('Result:', JSON.stringify(res1[0]))

    if (res1[0].id === '12345' && res1[0].phone === '9876543210') {
        console.log('✅ Auto-mapping successful')
    } else {
        console.error('❌ Failed')
    }

    // Test 2: Named Groups Single Field
    console.log('\nTest 2: Named Groups (getBalance)')
    // @ts-ignore
    const res2 = provider.parseTextResponse('ACCESS_BALANCE:10.50', mockConfig.mappings['getBalance'])
    console.log('Input: ACCESS_BALANCE:10.50')
    console.log('Result:', JSON.stringify(res2[0]))

    if (res2[0].balance === '10.50') {
        console.log('✅ Successful')
    } else {
        console.error('❌ Failed')
    }

    // Test 3: Legacy Numbered Groups
    console.log('\nTest 3: Legacy Numbered Groups')
    // @ts-ignore
    const res3 = provider.parseTextResponse('STATUS_8', mockConfig.mappings['legacyStatus'])
    console.log('Input: STATUS_8')
    console.log('Result:', JSON.stringify(res3[0]))

    if (res3[0].status === '8') {
        console.log('✅ Backward compatibility verified')
    } else {
        console.error('❌ Failed')
    }
}

test().catch(console.error)
