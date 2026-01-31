import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { AuthGuard } from '@/lib/auth/guard'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { wallet_transactions_total, recordIncident } from '@/lib/metrics'
import { notify } from '@/lib/notifications'
import { emitControlEvent } from '@/lib/events/emitters/state-emitter'
import { WalletService } from '@/lib/wallet/wallet'

export async function GET(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit
    const roleFilter = searchParams.get('role') // 'ADMIN' | 'USER' | null
    const statusFilter = searchParams.get('status') // 'active' | 'banned' | null
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'
    const userId = searchParams.get('userId') // For fetching single user details
    const exportCsv = searchParams.get('export') === 'csv'

    try {
        // Single user detail fetch
        if (userId) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isBanned: true,
                    createdAt: true,
                    updatedAt: true,
                    wallet: {
                        select: {
                            id: true,
                            balance: true,
                            transactions: {
                                orderBy: { createdAt: 'desc' },
                                take: 20,
                                select: {
                                    id: true,
                                    amount: true,
                                    type: true,
                                    description: true,
                                    createdAt: true,
                                }
                            }
                        }
                    },
                    numbers: {
                        orderBy: { createdAt: 'desc' },
                        take: 10,
                        select: {
                            id: true,
                            phoneNumber: true,
                            countryName: true,
                            serviceName: true,
                            status: true,
                            createdAt: true,
                        }
                    },
                    auditLogs: {
                        orderBy: { createdAt: 'desc' },
                        take: 20,
                        select: {
                            id: true,
                            action: true,
                            resourceType: true,
                            metadata: true,
                            createdAt: true,
                            ipAddress: true,
                        }
                    },
                    _count: {
                        select: { numbers: true, auditLogs: true }
                    }
                }
            })

            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 })
            }

            const walletBalance = Number(user.wallet?.balance ?? 0)

            return NextResponse.json({
                user: {
                    ...user,
                    numbersCount: user._count.numbers,
                    activityCount: user._count.auditLogs,
                    walletBalance,
                    walletId: user.wallet?.id,
                    transactions: user.wallet?.transactions || [],
                }
            })
        }

        const where: any = {}

        // Search filter
        if (query) {
            where.OR = [
                { email: { contains: query, mode: 'insensitive' } },
                { name: { contains: query, mode: 'insensitive' } },
            ]
        }

        // Role filter
        if (roleFilter && ['ADMIN', 'USER'].includes(roleFilter)) {
            where.role = roleFilter
        }

        // Status filter
        if (statusFilter === 'banned') {
            where.isBanned = true
        } else if (statusFilter === 'active') {
            where.isBanned = false
        }

        // For CSV export, fetch all matching users (up to 1000)
        if (exportCsv) {
            const allUsers = await prisma.user.findMany({
                where,
                take: 1000,
                orderBy: sortBy === 'walletBalance'
                    ? { wallet: { balance: sortOrder } }
                    : { [sortBy]: sortOrder },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isBanned: true,
                    createdAt: true,
                    _count: { select: { numbers: true } },
                    wallet: {
                        select: {
                            balance: true
                        }
                    }
                }
            })

            const csvData = allUsers.map(user => ({
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                status: user.isBanned ? 'Banned' : 'Active',
                balance: Number(user.wallet?.balance ?? 0),
                numbers: user._count.numbers,
                joinedAt: user.createdAt.toISOString(),
            }))

            return NextResponse.json({ csvData })
        }

        // Fetch users with enhanced data
        const users = await prisma.user.findMany({
            where,
            take: limit,
            skip,
            orderBy: sortBy === 'walletBalance'
                ? { wallet: { balance: sortOrder } }
                : { [sortBy]: sortOrder },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isBanned: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        numbers: true,
                        auditLogs: true
                    }
                },
                wallet: {
                    select: {
                        id: true,
                        balance: true
                    }
                }
            }
        })

        // Transform users to include computed fields
        const transformedUsers = users.map(user => {
            const walletBalance = Number(user.wallet?.balance ?? 0)

            return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isBanned: user.isBanned,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                numbersCount: user._count.numbers,
                activityCount: user._count.auditLogs,
                walletBalance: walletBalance,
                hasWallet: !!user.wallet,
                walletId: user.wallet?.id,
            }
        })

        const total = await prisma.user.count({ where })

        // Get aggregate stats
        const stats = await prisma.user.groupBy({
            by: ['role', 'isBanned'],
            _count: true
        })

        const totalUsers = await prisma.user.count()
        const totalAdmins = stats.filter(s => s.role === 'ADMIN').reduce((sum, s) => sum + s._count, 0)
        const totalBanned = stats.filter(s => s.isBanned).reduce((sum, s) => sum + s._count, 0)
        const activeUsers = totalUsers - totalBanned

        return NextResponse.json({
            users: transformedUsers,
            total,
            pages: Math.ceil(total / limit),
            page,
            stats: {
                total: totalUsers,
                admins: totalAdmins,
                banned: totalBanned,
                active: activeUsers,
            }
        })
    } catch (error) {
        console.error('Admin users fetch error:', error)
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

// Update User (Role/Ban)
export async function PATCH(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { userId, role, isBanned, walletAdjustment, adjustmentReason } = body

        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 })
        }

        // Prevent self-demotion/ban
        if (auth.user.userId === userId && (role === 'USER' || isBanned === true)) {
            return NextResponse.json({ error: 'Cannot demote or ban yourself' }, { status: 400 })
        }

        // Handle wallet adjustment
        if (walletAdjustment !== undefined && walletAdjustment !== 0) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { wallet: true }
            })

            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 })
            }

            const isCredit = walletAdjustment > 0
            const amount = Math.abs(walletAdjustment)
            const idempotencyKey = `admin_adj_${auth.user.userId}_${userId}_${Date.now()}`
            const description = adjustmentReason || `Admin ${isCredit ? 'credit' : 'debit'} by ${auth.user.userId}`

            try {
                if (isCredit) {
                    await WalletService.credit(userId, amount, 'manual_credit', description, idempotencyKey)
                } else {
                    await WalletService.debit(userId, amount, 'manual_debit', description, idempotencyKey)
                }
            } catch (error: any) {
                return NextResponse.json({ error: error.message || 'Credit/debit failed' }, { status: 400 })
            }

            // Audit log for wallet adjustment
            await prisma.auditLog.create({
                data: {
                    userId: auth.user.userId,
                    action: 'admin.wallet_adjustment',
                    resourceType: 'wallet',
                    resourceId: user.wallet?.id || 'new',
                    metadata: {
                        targetUserId: userId,
                        amount: walletAdjustment,
                        reason: adjustmentReason,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                }
            })

            // Send notification for credits
            if (isCredit) {
                notify.deposit({
                    userId,
                    userName: user.name || undefined,
                    userEmail: user.email || undefined,
                    amount: walletAdjustment,
                    depositId: `ADMIN-${Date.now()}`,
                    paidFrom: 'Admin',
                    paymentType: 'Manual Credit',
                    timestamp: new Date()
                }).catch(() => { })
            }

            return NextResponse.json({
                success: true,
                message: `Wallet adjusted by $${walletAdjustment.toFixed(2)}`,
                type: 'wallet_adjustment'
            })
        }

        // Handle role/ban updates
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(role && { role }),
                ...(isBanned !== undefined && { isBanned }),
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isBanned: true,
            }
        })

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: auth.user.userId,
                action: 'admin.user_update',
                resourceType: 'user',
                resourceId: userId,
                metadata: { role, isBanned },
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            }
        })

        // ENTERPRISE PROJECT OVERDRIVE: Real-time Socket Revocation
        if (isBanned === true) {
            await emitControlEvent('user.revoked', { userId })
        }

        return NextResponse.json({ success: true, user: updatedUser })

    } catch (error) {
        console.error('Admin user update error:', error)
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }
}

// Bulk actions
export async function POST(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { action, userIds } = body

        if (!action || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return NextResponse.json({ error: 'Invalid bulk action request' }, { status: 400 })
        }

        // Prevent bulk action on self
        if (userIds.includes(auth.user.userId) && ['ban', 'demote'].includes(action)) {
            return NextResponse.json({ error: 'Cannot perform this action on yourself' }, { status: 400 })
        }

        let updateData: any = {}
        switch (action) {
            case 'ban':
                updateData = { isBanned: true }
                break
            case 'unban':
                updateData = { isBanned: false }
                break
            case 'promote':
                updateData = { role: 'ADMIN' }
                break
            case 'demote':
                updateData = { role: 'USER' }
                break
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
        }

        const result = await prisma.user.updateMany({
            where: { id: { in: userIds } },
            data: updateData
        })

        // Audit log for bulk action
        await prisma.auditLog.create({
            data: {
                userId: auth.user.userId,
                action: `admin.bulk_${action}`,
                resourceType: 'user',
                resourceId: 'bulk',
                metadata: { userIds, action, count: result.count },
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
            }
        })

        // ENTERPRISE PROJECT OVERDRIVE: Bulk Real-time Socket Revocation
        if (action === 'ban') {
            for (const userId of userIds) {
                await emitControlEvent('user.revoked', { userId })
            }
        }

        return NextResponse.json({
            success: true,
            message: `${result.count} users updated`,
            count: result.count
        })

    } catch (error) {
        console.error('Bulk action error:', error)
        return NextResponse.json({ error: 'Bulk action failed' }, { status: 500 })
    }
}
