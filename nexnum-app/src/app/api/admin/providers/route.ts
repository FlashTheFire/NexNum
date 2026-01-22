
// Types synchronized with schema
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { requireAdmin, redactProvidersSecrets, redactProviderSecrets } from '@/lib/auth/requireAdmin'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { SettingsService } from '@/lib/settings'

export async function GET(req: Request) {
    const auth = await requireAdmin(req)
    if (auth.error) return auth.error

    try {
        const providers = await prisma.provider.findMany({
            orderBy: { priority: 'desc' },
            include: {
                testResults: {
                    orderBy: { testedAt: 'desc' },
                    take: 1,
                    select: { success: true, testedAt: true }
                }
            }
        })

        // Enhance with last test status and REDACT SECRETS
        const enhancedProviders = providers.map(p => {
            const { authKey, ...safeProvider } = p
            return {
                ...safeProvider,
                lastTest: p.testResults[0] || null,
                syncCount: p.syncCount
            }
        })

        return NextResponse.json(enhancedProviders)
    } catch (error) {
        console.error('Failed to fetch providers:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const auth = await requireAdmin(req)
    if (auth.error) return auth.error

    try {
        const body = await req.json()
        const { name, displayName, apiBaseUrl, authType, endpoints, mappings } = body

        if (!name || !displayName || !apiBaseUrl) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const existing = await prisma.provider.findUnique({ where: { name } })
        if (existing) {
            return NextResponse.json({ error: 'Provider name already exists' }, { status: 409 })
        }

        // Get default settings
        const settings = await SettingsService.getSettings()
        const pricing = settings.pricing

        // Sanitise numeric/decimal fields
        const sanitizedBody = { ...body }
        const numericFields = [
            'priceMultiplier', 'fixedMarkup', 'priority',
            'normalizationRate', 'depositSpent', 'depositReceived'
        ]

        numericFields.forEach(field => {
            if (sanitizedBody[field] !== undefined) {
                if (sanitizedBody[field] === '' || sanitizedBody[field] === null) {
                    // Default values if empty
                    if (field === 'priceMultiplier') sanitizedBody[field] = pricing.defaultMarkup
                    else if (field === 'priority') sanitizedBody[field] = 0
                    else sanitizedBody[field] = 0.0
                } else {
                    sanitizedBody[field] = Number(sanitizedBody[field])
                }
            }
        })

        const provider = await prisma.provider.create({
            data: {
                name,
                displayName,
                apiBaseUrl,
                authType: authType || 'bearer',
                authKey: body.authKey,
                authHeader: body.authHeader,
                authQueryParam: body.authQueryParam,
                endpoints: endpoints || {},
                mappings: mappings || {},
                description: body.description,
                logoUrl: body.logoUrl,
                websiteUrl: body.websiteUrl,
                isActive: false,
                priority: sanitizedBody.priority || 0,
                priceMultiplier: sanitizedBody.priceMultiplier || pricing.defaultMarkup,
                fixedMarkup: sanitizedBody.fixedMarkup || pricing.fixedMarkup,
                currency: body.currency || pricing.currency,
                normalizationMode: body.normalizationMode || 'AUTO',
                normalizationRate: sanitizedBody.normalizationRate || 1.0,
                apiPair: body.apiPair || '',
                depositSpent: sanitizedBody.depositSpent || 0.0,
                depositReceived: sanitizedBody.depositReceived || 0.0,
                // @ts-ignore - Prisma type sync
                depositCurrency: body.depositCurrency || 'USD'
            }
        })

        // Audit log the creation
        await logAdminAction({
            userId: auth.userId,
            action: 'PROVIDER_CREATE',
            resourceType: 'Provider',
            resourceId: provider.id,
            metadata: { name: provider.name, displayName: provider.displayName },
            ipAddress: getClientIP(req)
        })

        // Return without authKey
        return NextResponse.json(redactProviderSecrets(provider))
    } catch (error) {
        console.error('Failed to create provider:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
