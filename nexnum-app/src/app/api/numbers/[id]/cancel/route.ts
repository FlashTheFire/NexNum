import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { smsProvider } from '@/lib/sms-providers'

interface RouteParams {
    params: Promise<{ id: string }>
}

// POST /api/numbers/[id]/cancel - Cancel a number and get refund
export async function POST(request: Request, { params }: RouteParams) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        // Get number
        const number = await prisma.number.findUnique({
            where: { id },
            include: {
                smsMessages: true
            }
        })

        if (!number) {
            return NextResponse.json(
                { error: 'Number not found' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (number.ownerId !== user.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            )
        }

        // Check if already cancelled or expired
        if (number.status === 'cancelled') {
            return NextResponse.json(
                { error: 'Number already cancelled' },
                { status: 400 }
            )
        }

        if (number.status === 'expired') {
            return NextResponse.json(
                { error: 'Number already expired' },
                { status: 400 }
            )
        }

        // Check if SMS was received (no refund if SMS received)
        if (number.smsMessages.length > 0) {
            return NextResponse.json(
                { error: 'Cannot cancel - SMS already received' },
                { status: 400 }
            )
        }

        // Cancel with provider
        if (number.activationId) {
            try {
                await smsProvider.cancelNumber(number.activationId)
            } catch (e) {
                console.error('Provider cancel error:', e)
                // Continue anyway - we'll refund the user
            }
        }

        // Refund and update status in transaction
        const walletId = await ensureWallet(user.userId)

        await prisma.$transaction(async (tx) => {
            // Refund to wallet (positive amount = credit)
            await tx.walletTransaction.create({
                data: {
                    walletId,
                    amount: Number(number.price), // Positive = credit (refund)
                    type: 'refund',
                    description: `Refund for cancelled number: ${number.phoneNumber}`,
                }
            })

            // Update number status
            await tx.number.update({
                where: { id },
                data: { status: 'cancelled' }
            })

            // Audit log
            await tx.auditLog.create({
                data: {
                    userId: user.userId,
                    action: 'number.cancel',
                    resourceType: 'number',
                    resourceId: id,
                    metadata: {
                        phoneNumber: number.phoneNumber,
                        refundAmount: Number(number.price),
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                }
            })
        })

        return NextResponse.json({
            success: true,
            message: 'Number cancelled and refunded',
            refundAmount: Number(number.price),
        })

    } catch (error) {
        console.error('Cancel number error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
