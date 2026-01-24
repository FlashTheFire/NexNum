/**
 * Provider Control API
 * 
 * Admin operations for individual provider management:
 * - Enable/disable provider
 * - Adjust priority and weight
 * - Force circuit open/close
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { healthMonitor } from '@/lib/providers/health-monitor'
import { logger } from '@/lib/core/logger'

interface RouteParams {
    params: Promise<{ id: string }>
}

// GET - Get single provider details
export async function GET(request: Request, { params }: RouteParams) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const provider = await prisma.provider.findUnique({
            where: { id }
        })

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        const health = await healthMonitor.getHealth(id)

        return NextResponse.json({
            provider: {
                ...provider,
                priceMultiplier: Number(provider.priceMultiplier),
                fixedMarkup: Number(provider.fixedMarkup),
            },
            health
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

import { z } from 'zod'

// Validation schema
const ProviderUpdateSchema = z.object({
    isActive: z.boolean().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    weight: z.number().int().min(0).max(100).optional(),
    priceMultiplier: z.number().min(0).optional(),
    fixedMarkup: z.number().min(0).optional(),
    displayName: z.string().max(100).optional(),
    openCircuit: z.boolean().optional(),
    closeCircuit: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: "No valid update fields provided"
})

// PATCH - Update provider settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const body = await request.json()

        // Zod Validation
        const validation = ProviderUpdateSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json({
                error: 'Validation failed',
                details: validation.error.format()
            }, { status: 400 })
        }

        const {
            isActive,
            priority,
            weight,
            priceMultiplier,
            fixedMarkup,
            openCircuit,
            closeCircuit,
            displayName
        } = validation.data

        // Handle circuit commands first (Redis operations)
        if (openCircuit === true) {
            await healthMonitor.openCircuit(id)
            logger.info('Admin force-opened circuit', { providerId: id, adminId: auth.userId })

            // Log audit
            await prisma.auditLog.create({
                data: {
                    userId: auth.userId,
                    action: 'provider.circuit_open',
                    resourceType: 'provider',
                    resourceId: id,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })

            return NextResponse.json({ success: true, action: 'circuit_opened' })
        }

        if (closeCircuit === true) {
            await healthMonitor.closeCircuit(id)
            logger.info('Admin force-closed circuit', { providerId: id, adminId: auth.userId })

            await prisma.auditLog.create({
                data: {
                    userId: auth.userId,
                    action: 'provider.circuit_close',
                    resourceType: 'provider',
                    resourceId: id,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })

            return NextResponse.json({ success: true, action: 'circuit_closed' })
        }

        // Build update data
        const updateData: any = {}
        if (isActive !== undefined) updateData.isActive = isActive
        if (priority !== undefined) updateData.priority = priority
        if (weight !== undefined) updateData.weight = weight
        if (priceMultiplier !== undefined) updateData.priceMultiplier = priceMultiplier
        if (fixedMarkup !== undefined) updateData.fixedMarkup = fixedMarkup
        if (displayName !== undefined) updateData.displayName = displayName

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No update fields provided' }, { status: 400 })
        }

        const updated = await prisma.provider.update({
            where: { id },
            data: updateData
        })

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: auth.userId,
                action: 'provider.update',
                resourceType: 'provider',
                resourceId: id,
                metadata: updateData,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        logger.info('Provider updated', { providerId: id, changes: updateData, adminId: auth.userId })

        return NextResponse.json({ success: true, provider: updated })

    } catch (error: any) {
        logger.error('Provider update failed', { error: error.message })
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
