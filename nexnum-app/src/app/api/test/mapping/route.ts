import { NextRequest, NextResponse } from 'next/server'
import { DynamicProvider } from '@/lib/dynamic-provider'

/**
 * API endpoint for testing mapping configurations
 * Uses real DynamicProvider parsing logic
 */
export async function POST(req: NextRequest) {
    try {
        const { data, mapping, testName } = await req.json()

        if (!data || !mapping) {
            return NextResponse.json(
                { error: 'Missing data or mapping configuration' },
                { status: 400 }
            )
        }

        // Create a mock provider config for testing
        const mockConfig: any = {
            name: `Test_${testName || 'Parser'}`,
            apiBaseUrl: 'https://example.com', // Not used for parsing test
            authType: 'query_param',
            authQueryParam: 'api_key',
            apiKey: 'test_key',
            endpoints: {
                getPrices: {
                    method: 'GET',
                    path: '/prices'
                }
            },
            mappings: {
                getPrices: mapping
            }
        }

        // Create DynamicProvider instance
        const provider = new DynamicProvider(mockConfig)

        // Parse the test data using the real parser
        const response = {
            type: 'json',
            data: data
        }

        const results = provider['parseResponse'](response, 'getPrices')

        return NextResponse.json({
            success: true,
            parsed: results.length,
            results: results,
            mapping: mapping,
            note: 'Parsed using REAL DynamicProvider engine'
        })

    } catch (error: any) {
        console.error('[/api/test/mapping] Error:', error)
        return NextResponse.json(
            {
                success: false,
                error: error.message,
                stack: error.stack
            },
            { status: 500 }
        )
    }
}
