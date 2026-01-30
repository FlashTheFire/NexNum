
// Types synchronized with schema
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getProviderAdapter } from '@/lib/providers/provider-factory'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { AuthGuard } from '@/lib/auth/guard'
import { SmsProvider } from '@/lib/providers/types'

export async function POST(req: Request, source: { params: Promise<{ id: string }> }) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

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

    let engine: SmsProvider | null = null
    let metadataEngine: SmsProvider | null = null
    let isDynamic = false
    let useDynamicMeta = false

    try {
        const provider = await prisma.provider.findUnique({ where: { id } })
        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        // Main engine for all operations
        engine = getProviderAdapter(provider)

        // Metadata engine (same as main engine)
        metadataEngine = engine

        let result: any

        switch (action) {
            case 'testAll':
                // Parallel fetch for dashboard view
                const [bal, cnt, srv] = await Promise.all([
                    engine.getBalance?.().catch(e => ({ error: e.message })) ?? { error: 'Not supported' },
                    metadataEngine.getCountriesList().then(c => c.slice(0, 3)).catch(e => []),
                    // For services, we need a country. Try first country or default 'usa'/'ru'
                    metadataEngine.getCountriesList().then(async (c) => {
                        const target = c[0]?.code || 'usa'
                        const s = await metadataEngine!.getServicesList(target)
                        return { services: s.slice(0, 3), country: target }
                    }).catch(e => ({ services: [], country: '?' }))
                ])

                result = {
                    balance: typeof bal === 'number' ? bal : null,
                    balanceError: typeof bal === 'object' ? bal.error : null,
                    countries: cnt,
                    services: (srv as any).services,
                    serviceCountry: (srv as any).country,

                }
                break

            case 'getBalance':
                const balance = await engine.getBalance?.() ?? 0
                result = { balance }
                break
            case 'getCountriesList':
                const countries = await metadataEngine.getCountriesList()
                result = { count: countries.length, first: countries.slice(0, 5) }
                break
            case 'getServicesList':
                const services = await metadataEngine.getServicesList(params.country || '')
                result = { count: services.length, first: services.slice(0, 5) }
                break
            case 'getNumber':
                if (!params.country || !params.service) throw new Error('Country and Service params required')
                if (!engine.getNumber) throw new Error('getNumber is not supported by this provider')

                const dynamicEngine = engine as DynamicProvider
                result = await dynamicEngine.getNumber(params.country, params.service, {
                    operator: params.operator || undefined,
                    maxPrice: params.maxPrice || undefined
                })
                break
            case 'getStatus':
                if (!params.id) throw new Error('Activation ID required')
                if (!engine.getStatus) throw new Error('getStatus is not supported by this provider')
                result = await engine.getStatus(params.id)
                break
            case 'getPrices':
                // Get prices with optional country/service filters
                // Always use the engine's getPrices method to ensure optimization logic is applied
                const prices = await (engine as any).getPrices(params.country || undefined, params.service || undefined)
                result = { count: prices.length, first: prices.slice(0, 5) }
                break
            case 'setCancel':
                if (!params.id) throw new Error('Activation ID required')
                if (!engine.setCancel) throw new Error('setCancel is not supported by this provider')
                await engine.setCancel(params.id)
                result = { success: true, message: 'Number cancelled' }
                break
            case 'setResendCode':
                if (!params.id) throw new Error('Activation ID required')
                if (!engine.setResendCode) throw new Error('setResendCode is not supported by this provider')
                await engine.setResendCode(params.id)
                result = { success: true, message: 'Next SMS requested' }
                break
            case 'setComplete':
                if (!params.id) throw new Error('Activation ID required')
                if (!engine.setComplete) throw new Error('setComplete is not supported by this provider')
                await engine.setComplete(params.id)
                result = { success: true, message: 'Activation marked complete' }
                break
            case 'setStatus':
                // @deprecated - Disallowed in v2.0 but kept for emergency debug
                if (!params.id) throw new Error('Activation ID required')
                if (!params.status) throw new Error('Status required')
                const dynamicEngineForStatus = engine as DynamicProvider
                const statusResult = await dynamicEngineForStatus.setStatus(params.id, params.status)
                result = { success: true, message: 'Status updated (Deprecated)', response: statusResult }
                break
            case 'cancelNumber':
                // Backward compatibility alias
                if (!params.id) throw new Error('Activation ID required')
                if (!engine.setCancel) throw new Error('setCancel is not supported by this provider')
                await engine.setCancel(params.id)
                result = { success: true, message: 'Number cancelled (Alias)' }
                break
            default:
                // Default connection test (getCountriesList or getBalance)
                const endpoints = provider.endpoints as any
                if (endpoints && endpoints.getBalance) {
                    action = 'getBalance'
                    const balance = await engine.getBalance?.() ?? 0
                    result = { balance }
                } else {
                    action = 'getCountriesList'
                    const c = await engine.getCountriesList()
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
    // (We might not want to log every "getServicesList" lookup as a test result check)
    if (action === 'test' || action === 'getCountriesList' || action === 'getBalance') {
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

    // Determine which engine's trace to use based on action
    let traceEngine: any = null
    if (['getCountriesList', 'getServicesList'].includes(action)) {
        // Metadata operations use metadataEngine
        // Metadata operations use metadataEngine
        traceEngine = metadataEngine
    } else {
        // Other operations use main engine
        traceEngine = engine
    }

    return NextResponse.json({
        success,
        action,
        data: responseData,
        error: errorMsg,
        duration,
        trace: traceEngine?.lastRequestTrace ?? null
    })
}
