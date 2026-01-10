
// Types synchronized with schema
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getProviderAdapter, getMetadataProvider, hasDynamicConfig, usesDynamicMetadata } from '@/lib/provider-factory'
import { DynamicProvider } from '@/lib/dynamic-provider'
import { requireAdmin } from '@/lib/requireAdmin'
import { SmsProvider } from '@/lib/sms-providers/types'

export async function POST(req: Request, source: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin(req)
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

        // Main engine for non-metadata operations
        engine = getProviderAdapter(provider)
        isDynamic = hasDynamicConfig(provider)
        useDynamicMeta = usesDynamicMetadata(provider)

        // Metadata engine for getCountries/getServices (respects useDynamicMetadata flag)
        metadataEngine = getMetadataProvider(provider)

        let result: any

        switch (action) {
            case 'testAll':
                // Parallel fetch for dashboard view
                const [bal, cnt, srv] = await Promise.all([
                    engine.getBalance?.().catch(e => ({ error: e.message })) ?? { error: 'Not supported' },
                    metadataEngine.getCountries().then(c => c.slice(0, 3)).catch(e => []),
                    // For services, we need a country. Try first country or default 'usa'/'ru'
                    metadataEngine.getCountries().then(async (c) => {
                        const target = c[0]?.code || 'usa'
                        const s = await metadataEngine!.getServices(target)
                        return { services: s.slice(0, 3), country: target }
                    }).catch(e => ({ services: [], country: '?' }))
                ])

                result = {
                    balance: typeof bal === 'number' ? bal : null,
                    balanceError: typeof bal === 'object' ? bal.error : null,
                    countries: cnt,
                    services: (srv as any).services,
                    serviceCountry: (srv as any).country,
                    usingLegacyMetadata: !useDynamicMeta
                }
                break

            case 'getBalance':
                result = { balance: await engine.getBalance?.() ?? 0 }
                break
            case 'getCountries':
                // Use metadata engine (respects useDynamicMetadata flag)
                const countries = await metadataEngine.getCountries()
                result = {
                    count: countries.length,
                    first: countries.slice(0, 5), // Return first 5 for better debugging
                    usingLegacyMetadata: !useDynamicMeta
                }
                break
            case 'getServices':
                // Country is optional - some providers list all services without it
                // Use metadata engine (respects useDynamicMetadata flag)
                const services = await metadataEngine.getServices(params.country || '')
                result = {
                    count: services.length,
                    first: services.slice(0, 5), // Return first 5 for better debugging
                    usingLegacyMetadata: !useDynamicMeta
                }
                break
            case 'getNumber':
                if (!params.country || !params.service) throw new Error('Country and Service params required')
                if (!engine.getNumber) throw new Error('getNumber is not supported by this provider')
                // Cast to DynamicProvider to access extended options
                if (isDynamic) {
                    const dynamicEngine = engine as DynamicProvider
                    result = await dynamicEngine.getNumber(params.country, params.service, {
                        operator: params.operator || undefined,
                        maxPrice: params.maxPrice || undefined
                    })
                } else {
                    result = await engine.getNumber(params.country, params.service)
                }
                break
            case 'getStatus':
                if (!params.id) throw new Error('Activation ID required')
                if (!engine.getStatus) throw new Error('getStatus is not supported by this provider')
                result = await engine.getStatus(params.id)
                break
            case 'getPrices':
                // Get prices with optional country/service filters (DynamicProvider only)
                if (!isDynamic || !('getPrices' in engine)) {
                    throw new Error('getPrices is only supported for dynamic providers')
                }
                const dynamicEngine = engine as DynamicProvider
                const prices = await dynamicEngine.getPrices(params.country || undefined, params.service || undefined)
                result = {
                    count: prices.length,
                    first: prices.slice(0, 5) // Return first 5 prices for preview
                }
                break
            case 'cancelNumber':
                if (!params.id) throw new Error('Activation ID required')
                if (!engine.cancelNumber) throw new Error('cancelNumber is not supported by this provider')
                await engine.cancelNumber(params.id)
                result = { success: true, message: 'Number cancelled' }
                break
            case 'setStatus':
                // Set activation status: -1 (cancel), 1 (ready), 3 (retry), 6 (complete), 8 (ban)
                if (!params.id) throw new Error('Activation ID required')
                if (!params.status) throw new Error('Status required (-1, 1, 3, 6, or 8)')
                if (!isDynamic) throw new Error('setStatus is only supported for dynamic providers')
                const dynamicEngineForStatus = engine as DynamicProvider
                const statusResult = await dynamicEngineForStatus.setStatus(params.id, params.status)
                result = { success: true, message: 'Status updated', response: statusResult }
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
                requestUrl: isDynamic ? 'DYNAMIC' : 'LEGACY',
                responseData: responseData,
                error: errorMsg,
            }
        })
    }

    // Determine which engine's trace to use based on action
    let traceEngine: any = null
    if (['getCountries', 'getServices'].includes(action)) {
        // Metadata operations use metadataEngine
        traceEngine = useDynamicMeta && metadataEngine ? metadataEngine : null
    } else {
        // Other operations use main engine
        traceEngine = isDynamic && engine ? engine : null
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
