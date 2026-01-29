import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { AuthGuard } from '@/lib/auth/guard'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { z } from 'zod'

const schema = z.object({
    hash: z.string().length(64),
    description: z.string().optional()
})

const getSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(5).max(100).default(20),
    search: z.string().optional()
})

export async function GET(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const result = getSchema.safeParse(Object.fromEntries(searchParams))

    if (!result.success) {
        return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
    }

    const { page, limit, search } = result.data
    const skip = (page - 1) * limit

    const where = search ? {
        OR: [
            { hash: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } }
        ]
    } : {}

    const [total, items] = await Promise.all([
        prisma.bannedIcon.count({ where }),
        prisma.bannedIcon.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit
        })
    ])

    return NextResponse.json({
        items,
        pagination: {
            total,
            pages: Math.ceil(total / limit),
            current: page
        }
    })
}

export async function POST(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const result = schema.safeParse(body)

        if (!result.success) {
            return NextResponse.json({ error: 'Invalid payload: Hash must be SHA-256 (64 chars)' }, { status: 400 })
        }

        const { hash, description } = result.data

        const banned = await prisma.bannedIcon.upsert({
            where: { hash },
            create: { hash, description },
            update: { description }
        })

        await logAdminAction({
            userId: auth.user.userId,
            action: 'BANNED_ICON_ADD',
            resourceType: 'BannedIcon',
            resourceId: banned.hash,
            metadata: { description },
            ipAddress: getClientIP(request)
        })

        return NextResponse.json({ success: true, item: banned })
    } catch (e) {
        return NextResponse.json({ error: 'Failed to add banned icon' }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const { searchParams } = new URL(request.url)
        const hash = searchParams.get('hash')

        if (!hash) {
            return NextResponse.json({ error: 'Hash required' }, { status: 400 })
        }

        await prisma.bannedIcon.delete({ where: { hash } })

        await logAdminAction({
            userId: auth.user.userId,
            action: 'BANNED_ICON_REMOVE',
            resourceType: 'BannedIcon',
            resourceId: hash,
            ipAddress: getClientIP(request)
        })

        return NextResponse.json({ success: true })
    } catch (e) {
        return NextResponse.json({ error: 'Failed to remove ban' }, { status: 500 })
    }
}

