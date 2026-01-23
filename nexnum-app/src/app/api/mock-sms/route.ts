import { NextRequest, NextResponse } from 'next/server'
import { MockSmsProvider } from '@/lib/sms-providers/mock-provider'
import { logger } from '@/lib/core/logger'

// Initialize mock provider (singleton)
const mockProvider = MockSmsProvider.getInstance()

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams
    const action = searchParams.get('action')

    // Log the request for debugging
    logger.debug('[MockSMS] API Request', {
        action,
        query: Object.fromEntries(searchParams.entries())
    })

    // Simulate network delay (50-200ms) for realism
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150))

    try {
        switch (action) {
            case 'getBalance':
                return new NextResponse(`ACCESS_BALANCE:${mockProvider.getBalance()}`, {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain' }
                })

            case 'getNumber': {
                const service = searchParams.get('service')
                const country = searchParams.get('country')

                if (!service || !country) {
                    return new NextResponse('BAD_SERVICE', { status: 200 })
                }

                try {
                    const result = await mockProvider.purchaseNumber(country, service)
                    return new NextResponse(`ACCESS_NUMBER:${result.id}:${result.phoneNumber}`, {
                        status: 200,
                        headers: { 'Content-Type': 'text/plain' }
                    })
                } catch (error: any) {
                    if (error.message === 'NO_NUMBERS') return new NextResponse('NO_NUMBERS', { status: 200 })
                    if (error.message === 'BAD_SERVICE') return new NextResponse('BAD_SERVICE', { status: 200 })
                    throw error
                }
            }

            case 'getNumberV2': {
                const service = searchParams.get('service')
                const country = searchParams.get('country')

                if (!service || !country) {
                    return new NextResponse('BAD_SERVICE', { status: 200 })
                }

                try {
                    const result = await mockProvider.purchaseNumber(country, service)
                    return NextResponse.json({
                        activationId: result.id,
                        phoneNumber: result.phoneNumber,
                        activationCost: result.cost,
                        currency: '840', // USD
                        countryCode: country,
                        canGetAnotherSms: result.canGetAnotherSms ? '1' : '0',
                        activationTime: result.createdAt.toISOString().replace('T', ' ').split('.')[0],
                        activationOperator: 'mock-telecom'
                    })
                } catch (error: any) {
                    if (error.message === 'NO_NUMBERS') return new NextResponse('NO_NUMBERS', { status: 200 })
                    throw error
                }
            }

            case 'getStatus': {
                const id = searchParams.get('id')
                if (!id) return new NextResponse('ERROR_NO_ID', { status: 200 })

                const status = mockProvider.getStatus(id)
                return new NextResponse(status, {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain' }
                })
            }

            case 'setStatus': {
                const id = searchParams.get('id')
                const status = searchParams.get('status')

                if (!id || !status) return new NextResponse('BAD_DATA', { status: 200 })

                const result = mockProvider.setStatus(id, status)
                return new NextResponse(result, {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain' }
                })
            }

            case 'getPrices': {
                const country = searchParams.get('country')
                const service = searchParams.get('service')

                const prices = mockProvider.getPrices(country, service)
                return NextResponse.json(prices)
            }

            case 'getCountries': {
                const countries = mockProvider.getCountries()
                return NextResponse.json(countries)
            }

            case 'getServicesList': {
                const services = mockProvider.getServices()
                return NextResponse.json({
                    status: 'success',
                    services
                })
            }

            default:
                return new NextResponse('BAD_ACTION', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain' }
                })
        }
    } catch (error: any) {
        logger.error('[MockSMS] API Error', { error: error.message })
        return new NextResponse('ERROR_SQL', { status: 500 }) // Mimic real provider error
    }
}
