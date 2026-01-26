import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/core/logger'

// ============================================
// PRODUCTION GUARD
// ============================================
// This endpoint is for development/testing only
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const MOCK_ENABLED = process.env.ENABLE_MOCK_PROVIDER === 'true'

function productionGuard() {
    if (IS_PRODUCTION && !MOCK_ENABLED) {
        return NextResponse.json(
            { error: 'Mock SMS API is disabled in production' },
            { status: 404 }
        )
    }
    return null
}

// Lazy load mock provider only when needed
function getMockProvider() {
    // Dynamic import to avoid loading in production
    const { MockSmsProvider } = require('@/lib/providers/mock/mock-provider')
    return MockSmsProvider.getInstance()
}

export async function GET(req: NextRequest) {
    // Check production guard
    const guardResponse = productionGuard()
    if (guardResponse) return guardResponse

    const mockProvider = getMockProvider()
    const startTime = Date.now()
    const searchParams = req.nextUrl.searchParams
    const action = searchParams.get('action') || 'unknown'
    const params = Object.fromEntries(searchParams.entries())

    // Simulate network delay (50-200ms) for realism
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150))

    let responseText = ''
    let isJson = false

    try {
        switch (action) {
            case 'getPrices': {
                const country = searchParams.get('country') || undefined
                const service = searchParams.get('service') || undefined
                responseText = JSON.stringify(mockProvider.getPrices(country, service))
                isJson = true
                break
            }

            case 'getBalance':
                responseText = `ACCESS_BALANCE:${mockProvider.getBalance()}`
                break

            case 'getNumber': {
                const service = searchParams.get('service')
                const country = searchParams.get('country')

                if (!service || !country) {
                    responseText = 'BAD_SERVICE'
                    break
                }

                try {
                    const result = await mockProvider.purchaseNumber(country, service)
                    responseText = `ACCESS_NUMBER:${result.id}:${result.phoneNumber}`
                } catch (error: any) {
                    responseText = error.message === 'NO_NUMBERS' ? 'NO_NUMBERS' :
                        error.message === 'BAD_SERVICE' ? 'BAD_SERVICE' : 'ERROR'
                }
                break
            }

            case 'getNumberV2': {
                const service = searchParams.get('service')
                const country = searchParams.get('country')

                if (!service || !country) {
                    responseText = 'BAD_SERVICE'
                    break
                }

                try {
                    const result = await mockProvider.purchaseNumber(country, service)
                    responseText = `ACCESS_NUMBER:${result.id}:${result.phoneNumber}`
                } catch (error: any) {
                    responseText = error.message === 'NO_NUMBERS' ? 'NO_NUMBERS' :
                        error.message === 'BAD_SERVICE' ? 'BAD_SERVICE' : 'ERROR'
                }
                break
            }

            case 'getStatus': {
                const id = searchParams.get('id')
                if (!id) {
                    responseText = 'BAD_KEY'
                    break
                }
                responseText = mockProvider.getStatus(id)
                break
            }

            case 'setStatus': {
                const id = searchParams.get('id')
                const status = searchParams.get('status')

                if (!id) {
                    responseText = 'BAD_KEY'
                    break
                }
                // Delegate to provider class which handles 8 (cancel), 6 (done), 3 (retry), 1 (ready)
                responseText = mockProvider.setStatus(id, status || '')
                break
            }

            case 'getCountries':
                responseText = JSON.stringify(mockProvider.getCountries())
                isJson = true
                break

            case 'getServicesList':
                responseText = JSON.stringify(mockProvider.getServices())
                isJson = true
                break

            case 'debug_state':
                responseText = JSON.stringify({
                    balance: mockProvider.getBalance(),
                    orders: mockProvider.getAllOrders(),
                    logs: mockProvider.getRequestLogs(),
                })
                isJson = true
                break

            case 'debug_logs':
                responseText = JSON.stringify(mockProvider.getRequestLogs())
                isJson = true
                break

            case 'force_sms': {
                const id = searchParams.get('id')
                const code = searchParams.get('code') || Math.floor(100000 + Math.random() * 900000).toString()
                if (!id) {
                    responseText = 'BAD_KEY'
                    break
                }
                const success = mockProvider.forceSms(id, code)
                responseText = success ? `SMS_SENT:${code}` : 'ACTIVATION_NOT_FOUND'
                break
            }

            default:
                responseText = 'BAD_ACTION'
        }
    } catch (error: any) {
        logger.error(`[MockSMS] Error processing ${action}: ${error.message}`)
        console.error(`[MockSMS] CRITICAL ERROR in ${action}:`, error)
        responseText = `ERROR:${error.message}`
    }

    // Log request
    mockProvider.logRequest({
        timestamp: new Date(),
        action,
        params: Object.fromEntries(req.nextUrl.searchParams),
        response: responseText,
        durationMs: Date.now() - startTime,
    })

    return new NextResponse(responseText, {
        headers: { 'Content-Type': isJson ? 'application/json' : 'text/plain' },
    })
}

export async function POST(req: NextRequest) {
    // Check production guard
    const guardResponse = productionGuard()
    if (guardResponse) return guardResponse

    // POST just redirects to GET for compatibility
    return GET(req)
}
