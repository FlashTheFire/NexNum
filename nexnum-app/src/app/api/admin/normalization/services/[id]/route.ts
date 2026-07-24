/**
 * PATCH /api/admin/normalization/services/:id
 * Update a canonical service: aliases, verified status, display name.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await request.json()
    const { id } = await params
    const { displayName, aliases, isVerified, isActive, metadata: meta } = body

    const where = { id: parseInt(id) }
    const data: any = {}
    if (displayName !== undefined) data.displayName = displayName
    if (aliases !== undefined) data.aliases = aliases
    if (isVerified !== undefined) data.isVerified = isVerified
    if (isActive !== undefined) data.isActive = isActive
    if (meta !== undefined) data.metadata = meta

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updated = await (prisma as any).canonicalService.update({
      where,
      data,
    })

    logger.info('[admin/normalization/services] Updated', { id: updated.id })

    return NextResponse.json({ success: true, item: updated })
  } catch (error: any) {
    logger.error('[admin/normalization/services/[id]] PATCH error:', { error: error.message })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
