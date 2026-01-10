import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { syncUserNumbers } from '@/lib/sms/sync'
import { getServiceIconUrlByName } from '@/lib/search/search'
import { getCountryFlagUrl } from '@/lib/normalizers/country-flags'

// GET /api/numbers/my - Get user's numbers
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }


        // Get query params
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status') // active, expired, cancelled
        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

        // Build where clause
        const where: any = { ownerId: user.userId }

        if (status) {
            where.status = status
        } else {
            // Default: "Show ALL numbers" (Fix for disappearing numbers)
            // We need to return expired/cancelled numbers so they can be shown in the Vault
            // and not just vanish when they expire.
            // where.status = { in: ['active', 'received', 'expired', 'cancelled'] }

            // Actually, we don't need to set status at all to get everything
            // But let's be explicit if needed, or just leave it undefined to fetch all.
            // However, previous logic set it. Let's effectively remove the filter 
            // but we might want to ensure we don't accidentally fetch 'deleted' if that status exists.
            // For now, fetching everything belonging to the user is correct for the "My Numbers" endpoint.
        }

        // 1. Get numbers with pagination (First fetch)
        const [numbers, total] = await Promise.all([
            prisma.number.findMany({
                where,
                include: {
                    smsMessages: {
                        orderBy: { receivedAt: 'desc' },
                        take: 5, // Only last 5 messages for preview
                    },
                    _count: {
                        select: { smsMessages: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.number.count({ where }),
        ])

        // 2. Intelligent Sync (Only for visible active numbers)
        // This satisfies "no external req if no number" and "don't request fastly"
        if (numbers.length > 0) {
            // Identify active numbers in this page
            const activeIds = numbers
                .filter(n => ['active', 'received'].includes(n.status))
                .map(n => n.id)

            if (activeIds.length > 0) {
                // Background Sync: Trigger but don't await (Phase 10)
                // This makes the dashboard load instantly
                syncUserNumbers(user.userId, { numberIds: activeIds }).catch(err => {
                    console.error('[SYNC] Background sync failed:', err)
                })
            }
        }

        // Build response with optimized lookups
        const mappedNumbers = await Promise.all(numbers.map(async n => {
            // Favor persisted metadata from DB (Fastest)
            // Fallback to MeiliSearch only if DB is empty
            const serviceIconUrl = (n as any).serviceIconUrl
                ? (n as any).serviceIconUrl
                : (n.serviceName ? await getServiceIconUrlByName(n.serviceName) : undefined)

            const countryIconUrl = (n as any).countryIconUrl
                ? (n as any).countryIconUrl
                : (n.countryName ? await getCountryFlagUrl(n.countryName) : undefined)

            return {
                id: n.id,
                phoneNumber: n.phoneNumber,
                countryCode: n.countryCode,
                countryName: n.countryName,
                countryIconUrl,
                serviceName: n.serviceName,
                serviceCode: n.serviceCode,
                serviceIconUrl,
                price: Number(n.price),
                provider: n.provider,
                status: n.status,
                expiresAt: n.expiresAt,
                purchasedAt: n.purchasedAt,
                smsCount: n._count.smsMessages,
                latestSms: n.smsMessages[0] ? {
                    content: n.smsMessages[0].content,
                    code: n.smsMessages[0].code,
                    receivedAt: n.smsMessages[0].receivedAt,
                } : null,
            }
        }))

        return NextResponse.json({
            success: true,
            numbers: mappedNumbers,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        })

    } catch (error) {
        console.error('Get my numbers error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
