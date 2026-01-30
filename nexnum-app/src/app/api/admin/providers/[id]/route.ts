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
import { AuthGuard } from '@/lib/auth/guard'
import { healthMonitor } from '@/lib/providers/health-monitor'
import { logger } from '@/lib/core/logger'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { deleteOffersByProvider } from '@/lib/search/search'

interface RouteParams {
    params: Promise<{ id: string }>
}

// GET - Get single provider details
export async function GET(request: Request, { params }: RouteParams) {
    const auth = await AuthGuard.requireAdmin()
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
    priority: z.coerce.number().int().min(0).max(100).optional(),
    weight: z.coerce.number().int().min(0).max(100).optional(),
    priceMultiplier: z.coerce.number().min(0).optional(),
    fixedMarkup: z.coerce.number().min(0).optional(),
    displayName: z.string().max(100).optional(),
    openCircuit: z.boolean().optional(),
    closeCircuit: z.boolean().optional(),

    // Configuration Fields
    apiBaseUrl: z.string().url().optional(),
    authType: z.enum(['bearer', 'header', 'query_param', 'none']).optional(),
    providerType: z.string().optional(),
    authKey: z.string().optional(),
    authHeader: z.string().optional(),
    authQueryParam: z.string().optional(),

    // JSON Fields
    endpoints: z.any().optional(),
    mappings: z.any().optional(),
    // Logic Flags

    normalizationMode: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: "No valid update fields provided"
})

// PATCH - Update provider settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const auth = await AuthGuard.requireAdmin()
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
            displayName,
            // Config
            apiBaseUrl,
            authType,
            providerType,
            authKey,
            authHeader,
            authQueryParam,
            endpoints,
            mappings,
            normalizationMode
        } = validation.data

        // Handle circuit commands first (Redis operations)
        if (openCircuit === true) {
            await healthMonitor.openCircuit(id)
            logger.info('Admin force-opened circuit', { providerId: id, adminId: auth.user.userId })

            // Log audit
            await prisma.auditLog.create({
                data: {
                    userId: auth.user.userId,
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
            logger.info('Admin force-closed circuit', { providerId: id, adminId: auth.user.userId })

            await prisma.auditLog.create({
                data: {
                    userId: auth.user.userId,
                    action: 'provider.circuit_close',
                    resourceType: 'provider',
                    resourceId: id,
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
                }
            })

            return NextResponse.json({ success: true, action: 'circuit_closed' })
        }

        // Handle sensitive field encryption
        let encryptedKey = undefined
        if (authKey) {
            const { encrypt } = await import('@/lib/security/encryption')
            encryptedKey = encrypt(authKey)
        }

        // Build update data
        const updateData: any = {}
        if (isActive !== undefined) updateData.isActive = isActive
        if (priority !== undefined) updateData.priority = priority
        if (weight !== undefined) updateData.weight = weight
        if (priceMultiplier !== undefined) updateData.priceMultiplier = priceMultiplier
        if (fixedMarkup !== undefined) updateData.fixedMarkup = fixedMarkup
        if (displayName !== undefined) updateData.displayName = displayName

        // Map Config Fields
        if (apiBaseUrl !== undefined) updateData.apiBaseUrl = apiBaseUrl
        if (authType !== undefined) updateData.authType = authType
        if (providerType !== undefined) updateData.providerType = providerType
        if (authHeader !== undefined) updateData.authHeader = authHeader
        if (authQueryParam !== undefined) updateData.authQueryParam = authQueryParam
        if (encryptedKey !== undefined) updateData.authKey = encryptedKey

        if (endpoints !== undefined) updateData.endpoints = endpoints
        if (mappings !== undefined) updateData.mappings = mappings
        if (normalizationMode !== undefined) updateData.normalizationMode = normalizationMode

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
                userId: auth.user.userId,
                action: 'provider.update',
                resourceType: 'provider',
                resourceId: id,
                metadata: updateData,
                ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
            }
        })

        logger.info('Provider updated', { providerId: id, changes: updateData, adminId: auth.user.userId })

        return NextResponse.json({ success: true, provider: updated })

    } catch (error: any) {
        logger.error('Provider update failed', { error: error.message })
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// DELETE - Remove provider and its data
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        // 1. Get provider slug for MeiliSearch cleanup
        const provider = await prisma.provider.findUnique({
            where: { id },
            select: { name: true, displayName: true }
        })

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        // 2. Cleanup MeiliSearch Documents
        await deleteOffersByProvider(provider.name)

        // 3. Delete from PostgreSQL (Cascales relates like ProviderCountry, ProviderService)
        await prisma.provider.delete({
            where: { id }
        })

        // 4. Log the action
        await logAdminAction({
            userId: auth.user.userId,
            action: 'PROVIDER_DELETE',
            resourceType: 'Provider',
            resourceId: id,
            metadata: { name: provider.name, displayName: provider.displayName },
            ipAddress: getClientIP(request)
        })

        logger.info('Provider deleted permanently', {
            providerId: id,
            name: provider.name,
            adminId: auth.user.userId
        })

        return NextResponse.json({ success: true, message: 'Provider deleted successfully' })

    } catch (error: any) {
        logger.error('Provider deletion failed', { error: error.message })
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
