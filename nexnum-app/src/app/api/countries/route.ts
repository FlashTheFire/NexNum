import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET - Get all active countries from cache
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const provider = searchParams.get('provider') || 'grizzlysms'
        const search = searchParams.get('search') || ''
        const popular = searchParams.get('popular') === 'true'

        const countries = await prisma.country.findMany({
            where: {
                provider,
                isActive: true,
                ...(search ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { slug: { contains: search, mode: 'insensitive' } },
                    ]
                } : {}),
                ...(popular ? { popular: { gt: 0 } } : {}),
            },
            orderBy: [
                { popular: 'desc' },
                { name: 'asc' }
            ],
            select: {
                id: true,
                externalId: true,
                name: true,
                slug: true,
                phoneCode: true,
                iconUrl: true,
                popular: true,
                provider: true,
            }
        })

        return NextResponse.json({
            success: true,
            countries,
            count: countries.length,
        })

    } catch (error) {
        console.error('Countries fetch error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch countries' },
            { status: 500 }
        )
    }
}
