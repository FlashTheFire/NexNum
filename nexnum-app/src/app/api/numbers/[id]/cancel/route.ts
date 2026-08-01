import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { smsProvider } from '@/lib/providers'
import { WalletService } from '@/lib/wallet/wallet'

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
        const smsCount = await prisma.smsMessage.count({ where: { numberId: id } })
        if (smsCount > 0) {
            return NextResponse.json(
                { error: 'Cannot cancel - SMS already received' },
                { status: 400 }
            )
        }

        // Cancel with provider using full activationId (preserves provider prefix)
        const actId = number.activationId || ''

        if (actId) {
            try {
                if (smsProvider.setCancel) {
                    await smsProvider.setCancel(actId)
                } else {
                    await smsProvider.cancelNumber(actId)
                }
                console.log(`[CANCEL] Provider cancellation successful for ${actId}`)
            } catch (e: any) {
                console.warn(`[CANCEL] Provider cancel error for ${actId}:`, e.message)

                // Check if OTP arrived in the meantime
                try {
                    const statusResult = await smsProvider.getStatus(actId)
                    if (statusResult?.messages && statusResult.messages.length > 0) {
                        for (const msg of statusResult.messages) {
                            await prisma.smsMessage.create({
                                data: {
                                    numberId: number.id,
                                    sender: msg.code ? 'Verification Service' : 'SMS System',
                                    content: msg.content || (msg as any).text || (msg.code ? `Your verification code is: ${msg.code}` : 'Message received'),
                                    code: msg.code || null,
                                    receivedAt: new Date()
                                }
                            }).catch(() => {})
                        }
                        await prisma.number.update({ where: { id: number.id }, data: { status: 'received' } })
                        return NextResponse.json({ error: 'Cannot cancel - SMS Code was received from provider.', status: 'received' }, { status: 400 })
                    }
                } catch {}

                const rawMsg = String(e.message || 'Provider rejected cancellation')
                const cleanError = rawMsg.replace(/^Provider error:\s*/i, '')
                const errMsg = rawMsg.toLowerCase()
                const isAlreadyCancelledOrExpired = errMsg.includes('not found') || errMsg.includes('already') || errMsg.includes('bad_key') || errMsg.includes('no_key') || errMsg.includes('expired')

                if (!isAlreadyCancelledOrExpired) {
                    return NextResponse.json({
                        error: cleanError
                    }, { status: 400 })
                }
            }
        }

        // Refund and update status in transaction
        try {
            await prisma.$transaction(async (tx) => {
                // Refund to wallet using WalletService (atomic balance update)
                await WalletService.refund(
                    user.userId,
                    Number(number.price),
                    'refund',
                    id,
                    `Refund for cancelled number: ${number.phoneNumber}`,
                    `cancel_refund_${id}`, // Idempotency
                    tx
                )

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
        } catch (refundErr: any) {
            console.error('Refund transaction failed:', refundErr)
            return NextResponse.json({ error: 'Refund processing failed' }, { status: 500 })
        }

        // Remove from ActiveOrderStream so Tier 1 poller stops polling this activation
        if (number.activationId) {
            const { ActiveOrderStream } = await import('@/lib/activation/active-order-stream')
            ActiveOrderStream.removeActiveOrder(number.activationId).catch(() => {})
        }

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
