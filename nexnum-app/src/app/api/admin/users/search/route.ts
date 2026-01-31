import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { AuthGuard } from '@/lib/auth/guard'

/**
 * User Search API
 * GET /api/admin/users/search?q=query&role=USER|ADMIN&status=active|banned
 */
export async function GET(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const role = searchParams.get('role')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    try {
        // Build where clause
        const where: any = {}

        // Text search on email and name
        if (query) {
            where.OR = [
                { email: { contains: query, mode: 'insensitive' } },
                { name: { contains: query, mode: 'insensitive' } },
            ]
        }

        // Role filter
        if (role && ['USER', 'ADMIN'].includes(role)) {
            where.role = role
        }

        // Status filter
        if (status === 'active') {
            where.isBanned = false
        } else if (status === 'banned') {
            where.isBanned = true
        }

        // Get total count for pagination
        const totalCount = await prisma.user.count({ where })

        // Get users with pagination
        const users = await prisma.user.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isBanned: true,
                createdAt: true,
                wallet: {
                    select: {
                        id: true,
                        transactions: {
                            select: { amount: true, type: true },
                            // Show all movements that affect balance
                            where: {
                                type: {
                                    in: [
                                        'topup', 'manual_credit', 'manual_debit',
                                        'purchase', 'number_purchase', 'subscription_purchase',
                                        'item_purchase', 'refund', 'p2p_transfer_out', 'p2p_transfer_in'
                                    ]
                                }
                            },
                        }
                    }
                },
                _count: {
                    select: { numbers: true }
                }
            }
        })

        // Calculate wallet balance and total spent
        const enrichedUsers = users.map(user => {
            // Total spent = sum of all negative transactions (debits)
            const totalSpent = user.wallet?.transactions.reduce(
                (sum, t) => {
                    const amt = Number(t.amount)
                    return amt < 0 ? sum + Math.abs(amt) : sum
                },
                0
            ) || 0

            return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isBanned: user.isBanned,
                createdAt: user.createdAt,
                hasWallet: !!user.wallet,
                totalSpent: totalSpent.toFixed(2),
                numbersCount: user._count.numbers,
            }
        })

        return NextResponse.json({
            users: enrichedUsers,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
            }
        })

    } catch (error) {
        console.error('User search error:', error)
        return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
}

