import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { createApiKey } from '@/lib/api/api-keys'
import { ApiTier } from '@prisma/client'
import { prisma } from '@/lib/core/db'
import { auditLogger } from '@/lib/core/audit'
import { logger } from '@/lib/core/logger'
import { validateCSRFRequest } from '@/lib/security/csrf'

/**
 * POST /api/keys/test
 *
 * TEST-ONLY API KEY DISPENSER
 * ---------------------------
 * WARNING: This endpoint is for development / local testing only.
 * It will DELETE every existing API key for the authenticated user
 * and immediately create one fresh `nxn_live_<32 chars>` key.
 *
 * Security hardening (P1):
 *   - Strict 1 KB body size limit (prevents body smuggling)
 *   - CSRF validation BEFORE any body read
 *   - Environment-flag gated (ENABLE_TEST_KEY_DISPENSER=true)
 *   - Returns 404 in production regardless of flag
 */
const MAX_BODY_SIZE = 1024 // 1 KB

async function dispenseTestKey(request: NextRequest) {
    // 0. Feature-flag / Environment guard
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TEST_KEY_DISPENSER !== 'true') {
        return NextResponse.json(
            { success: false, error: 'Endpoint disabled' },
            { status: 404 }
        )
    }

    // 1. CSRF validation FIRST (before any body read)
    const csrfResult = await validateCSRFRequest(request.headers)
    if (!csrfResult.valid) {
        return NextResponse.json(
            { success: false, error: csrfResult.error || 'CSRF validation failed' },
            { status: 403 }
        )
    }

    // 2. Strict body size limit
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        return NextResponse.json(
            { success: false, error: 'Request body too large' },
            { status: 413 }
        )
    }

    try {
        const user = await getCurrentUser(request.headers)
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized — please log in first' },
                { status: 401 }
            )
        }

        // Atomic transaction for read, delete, remint, and audit
        const { existing, deleted, apiKey } = await prisma.$transaction(async (tx) => {
            const existingKeys = await tx.apiKey.findMany({
                where: { userId: user.userId },
                select: { id: true, prefix: true }
            })

            const deletedResult = await tx.apiKey.deleteMany({
                where: { userId: user.userId }
            })

            await auditLogger.log(user.userId, 'ADMIN_ACTION', {
                action: 'TEST_KEY_DISPENSER_WIPE',
                deletedCount: deletedResult.count,
                resourceType: 'api_key',
                note: 'Test endpoint hard-deleted all user keys before minting a new one'
            }, undefined, tx)

            const newKey = await createApiKey({
                userId: user.userId,
                name: 'test-dispenser-key',
                permissions: ['read', 'numbers', 'sms'],
                tier: 'FREE' as ApiTier
            }, tx)

            await auditLogger.log(user.userId, 'API_KEY_CREATE', {
                keyId: newKey.id,
                resourceType: 'api_key',
                resourceId: newKey.id,
                source: 'test-dispenser'
            }, undefined, tx)

            return {
                existing: existingKeys,
                deleted: deletedResult,
                apiKey: newKey
            }
        })

        // Best-effort Redis cache invalidation outside transaction
        try {
            const { redis } = await import('@/lib/core/redis')
            for (const key of existing) {
                if (key.prefix) {
                    await redis.del(`apikey:prefix:${key.prefix}`)
                }
                await redis.del(`apikey:id:${key.id}`)
            }
        } catch (cacheErr) {
            logger.warn('[TestKeyDispenser] Failed to purge Redis cache', { error: cacheErr })
        }

        return NextResponse.json(
            {
                success: true,
                warning: 'TEST ENDPOINT — old keys were deleted. Do not use in production.',
                deletedPreviousKeys: deleted.count,
                apiKey: {
                    id: apiKey.id,
                    name: apiKey.name,
                    prefix: apiKey.prefix,
                    rawKey: apiKey.rawKey, // shown once
                    tier: apiKey.tier,
                    permissions: apiKey.permissions,
                    rateLimit: apiKey.rateLimit,
                    createdAt: apiKey.createdAt
                }
            },
            { status: 200 }
        )
    } catch (error: any) {
        logger.error('Test key dispenser error', { error, context: 'API_KEYS_TEST' })
        return NextResponse.json(
            { success: false, error: error?.message || 'Internal server error' },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    return dispenseTestKey(request)
}
