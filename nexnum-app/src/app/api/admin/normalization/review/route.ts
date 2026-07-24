/**
 * Admin Mapping Review Queue API
 *
 * Lists pending normalization matches that need human review.
 * Allows approving, rejecting, or creating-new for ambiguous matches.
 *
 * GET  /api/admin/normalization/review?entityType=SERVICE&status=PENDING&provider=xxx
 * POST /api/admin/normalization/review  { queueId, action, canonicalId? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

// GET — list items in the review queue
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType') as 'SERVICE' | 'COUNTRY' | null
    const status = searchParams.get('status') as 'PENDING' | 'APPROVED' | 'REJECTED' | 'CREATE_NEW' | null
    const providerId = searchParams.get('provider')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {}
    if (entityType) where.entityType = entityType
    if (status) where.status = status
    if (providerId) where.providerId = providerId

    const items = await (prisma as any).mappingReviewQueue.findMany({
      where,
      orderBy: { priority: 'desc' },
      take: Math.min(limit, 200),
      include: {
        provider: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, username: true } },
      },
    })

    return NextResponse.json({ items, count: items.length })
  } catch (error: any) {
    logger.error('[admin/normalization/review] GET error:', { error: error.message })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST — resolve a review queue item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { queueId, action, canonicalId, userId } = body as {
      queueId: number
      action: 'APPROVED' | 'REJECTED' | 'CREATE_NEW'
      canonicalId?: number
      userId?: string
    }

    if (!queueId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: queueId, action' },
        { status: 400 }
      )
    }

    const validActions = ['APPROVED', 'REJECTED', 'CREATE_NEW']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Use one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    // Fetch the queue item
    const item = await (prisma as any).mappingReviewQueue.findUnique({
      where: { id: queueId },
    })

    if (!item) {
      return NextResponse.json({ error: `Queue item #${queueId} not found` }, { status: 404 })
    }

    if (item.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Item #${queueId} already resolved (${item.status})` },
        { status: 409 }
      )
    }

    // Apply the resolution
    const update: any = {
      status: action,
      resolvedAt: new Date(),
      resolvedById: userId || null,
    }

    if (action === 'APPROVED' && canonicalId) {
      update.bestMatchId = canonicalId
      update.bestMatchConfidence = 0.95 // confirmed by human

      // Update the matching mapping record
      if (item.entityType === 'SERVICE') {
        await (prisma as any).providerServiceMapping.updateMany({
          where: {
            providerId: item.providerId,
            providerServiceId: item.rawExternalId,
          },
          data: {
            canonicalServiceId: canonicalId,
            confidence: 0.95,
            matchMethod: 'MANUAL',
            isVerified: true,
            reviewedById: userId || null,
            reviewedAt: new Date(),
          },
        })
      } else {
        await (prisma as any).providerCountryMapping.updateMany({
          where: {
            providerId: item.providerId,
            providerCountryId: item.rawExternalId,
          },
          data: {
            canonicalCountryId: canonicalId,
            confidence: 0.95,
            matchMethod: 'MANUAL',
            isVerified: true,
            reviewedById: userId || null,
            reviewedAt: new Date(),
          },
        })
      }
    }

    await (prisma as any).mappingReviewQueue.update({
      where: { id: queueId },
      data: update,
    })

    logger.info('[admin/normalization/review] Resolved', {
      queueId,
      action,
      entityType: item.entityType,
      rawName: item.rawName,
    })

    return NextResponse.json({ success: true, queueId, action })
  } catch (error: any) {
    logger.error('[admin/normalization/review] POST error:', { error: error.message })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
