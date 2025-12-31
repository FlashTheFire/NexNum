import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/jwt'

// Helper to check admin
async function isAdmin(request: Request) {
    const token = request.headers.get('cookie')?.split('auth-token=')[1]?.split(';')[0]
    if (!token) return false
    const payload = await verifyToken(token)
    return payload?.role === 'ADMIN'
}

export async function GET(request: Request) {
    if (!await isAdmin(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = 20
    const skip = (page - 1) * limit

    try {
        const where = query ? {
            OR: [
                { email: { contains: query, mode: 'insensitive' as const } },
                { name: { contains: query, mode: 'insensitive' as const } },
            ]
        } : {}

        const users = await prisma.user.findMany({
            where,
            take: limit,
            skip,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isBanned: true,
                createdAt: true,
                _count: {
                    select: { numbers: true }
                }
            }
        })

        const total = await prisma.user.count({ where })

        return NextResponse.json({
            users,
            total,
            pages: Math.ceil(total / limit)
        })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

// Update User (Role/Ban)
export async function PATCH(request: Request) {
    if (!await isAdmin(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { userId, role, isBanned } = body

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 })
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(role && { role }), // Only update if provided
                ...(isBanned !== undefined && { isBanned }),
            }
        })

        return NextResponse.json({ success: true, user: updatedUser })

    } catch (error) {
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }
}
