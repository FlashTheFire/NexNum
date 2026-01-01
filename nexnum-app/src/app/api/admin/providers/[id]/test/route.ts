
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { DynamicProvider } from '@/lib/dynamic-provider'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/jwt'

async function verifyAdmin() {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return null
    try {
        const payload = await verifyToken(token)
        if (payload?.role === 'ADMIN') return payload
        return null
    } catch {
        return null
    }
}

export async function POST(req: Request, source: { params: Promise<{ id: string }> }) {
    const admin = await verifyAdmin()
    if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await source.params

    const startTime = Date.now()
    let success = false
    let httpStatus = 200
    let responseData = ''
    let errorMsg = ''

    // Default action
    let action = 'test'
    let params: any = {}

    try {
        const body = await req.json()
        if (body.action) action = body.action
        if (body.params) params = body.params
    } catch (e) {
        // Body parsing failed, ignore
    }

    try {
        const provider = await prisma.provider.findUnique({ where: { id } })
        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        const engine = new DynamicProvider(provider)
        let result: any

        switch (action) {
            case 'getBalance':
                result = { balance: await engine.getBalance() }
                break
            case 'getCountries':
                const countries = await engine.getCountries()
                result = {
                    count: countries.length,
                    first: countries.slice(0, 3) // Only return first 3 to keep log small
                }
                break
            case 'getServices':
                if (!params.country) throw new Error('Country param required')
                const services = await engine.getServices(params.country)
                result = {
                    count: services.length,
                    first: services.slice(0, 3)
                }
                break
            case 'getNumber':
                if (!params.country || !params.service) throw new Error('Country and Service params required')
                result = await engine.getNumber(params.country, params.service)
                break
            case 'getStatus':
                if (!params.id) throw new Error('Activation ID required')
                result = await engine.getStatus(params.id)
                break
            case 'cancelNumber':
                if (!params.id) throw new Error('Activation ID required')
                await engine.cancelNumber(params.id)
                result = { success: true, message: 'Number cancelled' }
                break
            default:
                // Default connection test (getCountries or getBalance)
                const endpoints = provider.endpoints as any
                if (endpoints && endpoints.getBalance) {
                    action = 'getBalance'
                    const bal = await engine.getBalance()
                    result = { balance: bal }
                } else {
                    action = 'getCountries'
                    const c = await engine.getCountries()
                    result = { count: c.length, first: c[0] }
                }
        }

        success = true
        responseData = JSON.stringify(result, null, 2)

    } catch (e: any) {
        success = false
        httpStatus = 500

        if (e.name === 'ProviderApiError') {
            const details = {
                _isErrorDetail: true, // Flag for frontend
                message: e.message,
                status: e.status,
                url: e.url,
                headers: e.requestHeaders,
                responseBody: e.responseBody
            }
            responseData = JSON.stringify(details, null, 2)
            errorMsg = e.message
        } else {
            errorMsg = e.message
            responseData = e.message?.substring(0, 1000) || 'Unknown error'
        }
    }

    const duration = Date.now() - startTime

    // Only save result if it's the default test or specifically requested
    // (We might not want to log every "getServices" lookup as a test result check)
    if (action === 'test' || action === 'getCountries' || action === 'getBalance') {
        await prisma.providerTestResult.create({
            data: {
                provider: { connect: { id } },
                action,
                success,
                httpStatus,
                responseTime: duration,
                requestUrl: 'DYNAMIC',
                responseData: responseData,
                error: errorMsg,
            }
        })
    }

    return NextResponse.json({
        success,
        action,
        data: responseData,
        error: errorMsg,
        duration
    })
}
