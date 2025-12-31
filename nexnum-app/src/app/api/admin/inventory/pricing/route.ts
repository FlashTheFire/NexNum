import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/jwt'

async function isAdmin(request: Request) {
    const token = request.headers.get('cookie')?.split('token=')[1]?.split(';')[0]
    if (!token) return false
    const payload = await verifyToken(token)
    return payload?.role === 'ADMIN'
}

export async function GET(request: Request) {
    if (!await isAdmin(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = 50
    const skip = (page - 1) * limit
    const search = searchParams.get('q') || ''

    try {
        const where = search ? {
            OR: [
                { provider: { contains: search, mode: 'insensitive' as const } },
                { country: { name: { contains: search, mode: 'insensitive' as const } } },
                { service: { name: { contains: search, mode: 'insensitive' as const } } }
            ]
        } : {}

        const items = await prisma.servicePricing.findMany({
            where,
            include: {
                country: { select: { name: true, externalId: true } },
                service: { select: { name: true, externalId: true } }
            },
            orderBy: [
                { price: 'asc' } // Cheapest first
            ],
            take: limit,
            skip
        })

        const total = await prisma.servicePricing.count({ where })

        // Transform to include readable names
        const formattedItems = items.map(item => ({
            id: item.id,
            countryCode: item.country?.name || item.countryId,
            serviceCode: item.service?.name || item.serviceId,
            provider: item.provider,
            cost: Number(item.price),
            count: item.count,
            lastSyncedAt: item.lastSyncedAt
        }))

        return NextResponse.json({
            items: formattedItems,
            total,
            pages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error('Pricing API Error:', error)
        return NextResponse.json({ error: 'Failed to fetch pricing' }, { status: 500 })
    }
}
