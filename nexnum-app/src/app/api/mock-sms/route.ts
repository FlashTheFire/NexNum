import { NextRequest, NextResponse } from 'next/server'
import { MockSmsProvider } from '@/lib/sms-providers/mock-provider'
import { logger } from '@/lib/core/logger'

// Initialize mock provider (singleton)
const mockProvider = MockSmsProvider.getInstance()

export async function GET(req: NextRequest) {
    const startTime = Date.now()
    const searchParams = req.nextUrl.searchParams
    const action = searchParams.get('action') || 'unknown'
    const params = Object.fromEntries(searchParams.entries())

    // Simulate network delay (50-200ms) for realism
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150))

    let responseText = ''

    try {
        switch (action) {
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
                    const data = {
                        activationId: result.id,
                        phoneNumber: result.phoneNumber,
                        activationCost: result.cost,
                        currency: '840',
                        countryCode: country,
                        canGetAnotherSms: result.canGetAnotherSms ? '1' : '0',
                        activationTime: result.createdAt.toISOString().replace('T', ' ').split('.')[0],
                        activationOperator: 'mock-telecom'
                    }
                    mockProvider.logRequest(action, params, JSON.stringify(data), Date.now() - startTime)
                    return NextResponse.json(data)
                } catch (error: any) {
                    responseText = error.message === 'NO_NUMBERS' ? 'NO_NUMBERS' : 'ERROR'
                }
                break
            }

            case 'getStatus': {
                const id = searchParams.get('id')
                if (!id) {
                    responseText = 'ERROR_NO_ID'
                    break
                }
                responseText = mockProvider.getStatus(id)
                break
            }

            case 'setStatus': {
                const id = searchParams.get('id')
                const status = searchParams.get('status')

                if (!id || !status) {
                    responseText = 'BAD_DATA'
                    break
                }

                responseText = mockProvider.setStatus(id, status)
                break
            }

            case 'getPrices': {
                const country = searchParams.get('country')
                const service = searchParams.get('service')
                const prices = mockProvider.getPrices(country, service)
                mockProvider.logRequest(action, params, '[JSON]', Date.now() - startTime)
                return NextResponse.json(prices)
            }

            case 'getCountries': {
                const countries = mockProvider.getCountries()
                mockProvider.logRequest(action, params, '[JSON]', Date.now() - startTime)
                return NextResponse.json(countries)
            }

            case 'getServicesList': {
                const services = mockProvider.getServices()
                mockProvider.logRequest(action, params, '[JSON]', Date.now() - startTime)
                return NextResponse.json({ status: 'success', services })
            }

            case 'debug_state': {
                // Don't log debug calls
                const orders = mockProvider.getAllOrders()
                return NextResponse.json({
                    balance: mockProvider.getBalance(),
                    orders,
                    logs: mockProvider.getRequestLogs()
                })
            }

            case 'force_sms': {
                const id = searchParams.get('id')
                if (!id) {
                    responseText = 'BAD_ID'
                    break
                }

                mockProvider.forceSms(id)
                responseText = 'SUCCESS'
                break
            }

            default:
                responseText = 'BAD_ACTION'
        }

        // Log the request (except debug actions)
        if (!action.startsWith('debug')) {
            mockProvider.logRequest(action, params, responseText, Date.now() - startTime)
        }

        return new NextResponse(responseText, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' }
        })
    } catch (error: any) {
        logger.error('[MockSMS] API Error', { error: error.message })
        mockProvider.logRequest(action, params, 'ERROR_SQL', Date.now() - startTime)
        return new NextResponse('ERROR_SQL', { status: 500 })
    }
}

