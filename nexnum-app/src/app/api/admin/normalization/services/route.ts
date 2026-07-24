/**
 * Admin Canonical Service Management API
 *
 * GET  /api/admin/normalization/services?search=discord&verified=true&page=1
 * POST /api/admin/normalization/services — create or update a canonical service
 * PATCH /api/admin/normalization/services/:id — update a specific canonical service
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

// GET — list canonical services with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const verified = searchParams.get('verified')
    const isActive = searchParams.get('active')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = (page - 1) * limit

    const where: any = {}
    if (verified !== null && verified !== undefined) {
      where.isVerified = verified === 'true'
    }
    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === 'true'
    }

    if (search) {
      where.OR = [
        { canonicalName: { contains: search, mode: 'insensitive' } },
        { canonicalCode: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      (prisma as any).canonicalService.findMany({
        where,
        orderBy: [{ providerCount: 'desc' }, { canonicalName: 'asc' }],
        skip: offset,
        take: limit,
        select: {
          id: true,
          canonicalCode: true,
          canonicalName: true,
          displayName: true,
          aliases: true,
          isVerified: true,
          isActive: true,
          providerCount: true,
          offerCount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      (prisma as any).canonicalService.count({ where }),
    ])

    return NextResponse.json({
      items,
      pagination: { page, limit, total, hasMore: offset + limit < total },
    })
  } catch (error: any) {
    logger.error('[admin/normalization/services] GET error:', { error: error.message })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST — bulk create/update canonical services
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, code, aliases, isVerified } = body as {
      name?: string
      code?: string
      aliases?: string[]
      isVerified?: boolean
    }

    if (!name && !code) {
      return NextResponse.json(
        { error: 'Missing required field: name or code' },
        { status: 400 }
      )
    }

    // Check for existing by code first
    let existing
    if (code) {
      existing = await (prisma as any).canonicalService.findUnique({
        where: { canonicalCode: code },
      })
    }

    if (existing) {
      // Update existing
      await (prisma as any).canonicalService.update({
        where: { id: existing.id },
        data: {
          canonicalName: name || existing.canonicalName,
          displayName: name || existing.displayName,
          aliases: aliases || existing.aliases,
          isVerified: isVerified ?? existing.isVerified,
        },
      })
      return NextResponse.json({ success: true, action: 'updated', id: existing.id })
    }

    // Create new
    const created = await (prisma as any).canonicalService.create({
      data: {
        canonicalCode: code || name!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        canonicalName: name || '',
        displayName: name || '',
        aliases: aliases || [],
        isVerified: isVerified ?? false,
      },
    })

    return NextResponse.json({ success: true, action: 'created', id: created.id }, { status: 201 })
  } catch (error: any) {
    logger.error('[admin/normalization/services] POST error:', { error: error.message })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
