
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
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

export async function GET(req: Request) {
    const admin = await verifyAdmin()
    if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const providers = await prisma.provider.findMany({
            orderBy: { priority: 'desc' },
            include: {
                _count: { select: { syncJobs: true } },
                testResults: {
                    orderBy: { testedAt: 'desc' },
                    take: 1,
                    select: { success: true, testedAt: true }
                }
            }
        })

        // Enhance with last test status
        const enhancedProviders = providers.map(p => ({
            ...p,
            lastTest: p.testResults[0] || null,
            syncCount: p._count.syncJobs
        }))

        return NextResponse.json(enhancedProviders)
    } catch (error) {
        console.error('Failed to fetch providers:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const admin = await verifyAdmin()
    if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
                priority: 0,
                priceMultiplier: body.priceMultiplier || 1.0,
                fixedMarkup: body.fixedMarkup || 0.0,
                currency: body.currency || 'USD'
            }
        })

        return NextResponse.json(provider)
    } catch (error) {
        console.error('Failed to create provider:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
