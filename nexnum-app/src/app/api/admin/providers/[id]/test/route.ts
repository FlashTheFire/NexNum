
// Types synchronized with schema
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getProviderAdapter, getMetadataProvider } from '@/lib/providers/provider-factory'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { SmsProvider } from '@/lib/providers/types'

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

        // Main engine for all operations
        engine = getProviderAdapter(provider)

        // Metadata engine (same as main engine in strict mode)
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

                }
                break

            case 'getBalance':
                result = { balance: await engine.getBalance?.() ?? 0 }
                break
            case 'getCountries':
                // Use metadataEngine

                // FORCE REFRESH: To show trace, we must bypass cache.
                // DynamicProvider doesn't expose skipCache directly in interface, so we hack it or rely on a new method.
                // Best approach: cast to DynamicProvider and access request method directly or add a skipCache arg to getCountries.

                let countries;
                if (metadataEngine instanceof DynamicProvider) {
                    // For testing: we want to trace the request, so we bypass the public getCountries cache wrapper
                    const res = await (metadataEngine as any).request('getCountries');
                    const items = (metadataEngine as any).parseResponse(res, 'getCountries');
                    // Manually map fields to match getCountries output style (simplified)
                    countries = items.map((i: any) => ({
                        id: String(i.id || i.code),
                        name: String(i.name || i.country),
                        code: String(i.code || i.id)
                    }));
                } else {
                    countries = await metadataEngine.getCountries()
                }

                result = {
                    count: countries.length,
                    first: countries.slice(0, 5), // Return first 5 for better debugging

                }
                break
            case 'getServices':
                // Country is optional - some providers list all services without it
                // Use metadata engine

                const services = await metadataEngine.getServices(params.country || '')
                result = {
                    count: services.length,
                    first: services.slice(0, 5), // Return first 5 for better debugging

                }
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
                const dynamicEnginePrices = engine as DynamicProvider
                const prices = await dynamicEnginePrices.getPrices(params.country || undefined, params.service || undefined)
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
                requestUrl: 'DYNAMIC',
                responseData: responseData,
                error: errorMsg,
            }
        })
    }

    // Determine which engine's trace to use based on action
    let traceEngine: any = null
    if (['getCountries', 'getServices'].includes(action)) {
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
