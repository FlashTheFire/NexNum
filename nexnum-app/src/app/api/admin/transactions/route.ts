import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/requireAdmin'

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type')

    const skip = (page - 1) * limit

    try {
        const where: any = {}

        if (type && type !== 'all') {
            where.type = type
        }

        if (search) {
            where.wallet = {
                user: {
                    OR: [
                        { email: { contains: search, mode: 'insensitive' } },
                        { name: { contains: search, mode: 'insensitive' } }
                    ]
                }
            }
        }

        const [transactions, total] = await Promise.all([
            prisma.walletTransaction.findMany({
                where,
                include: {
                    wallet: {
                        include: {
                            user: {
                                select: {
                                    email: true,
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.walletTransaction.count({ where })
        ])

        return NextResponse.json({
            transactions,
            total,
            pages: Math.ceil(total / limit)
        })

    } catch (error) {
        console.error("Transactions Error:", error)
        return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }
}
