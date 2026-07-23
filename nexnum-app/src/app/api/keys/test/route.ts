import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { createApiKey } from '@/lib/api/api-keys'
import { ApiTier } from '@prisma/client'
import { prisma } from '@/lib/core/db'
import { auditLogger } from '@/lib/core/audit'
import { logger } from '@/lib/core/logger'

/**
 * GET/POST /api/keys/test
 *
 * TEST-ONLY API KEY DISPENSER
 * ---------------------------
 * WARNING: This endpoint is for development / local testing only.
 * It will DELETE every existing API key for the authenticated user
 * and immediately create one fresh `nxn_live_<32 chars>` key.
 *
 * Flow per call:
 *   1. Authenticate the user (httpOnly cookie session).
 *   2. Hard-delete every ApiKey row for that user.
 *   3. Invalidate any Redis-cached validation for the deleted keys.
 *   4. Create one new key with default FREE-tier permissions.
 *   5. Return the new plaintext key (shown ONCE).
 *
 * Usage:
 *   curl -b cookies.txt http://localhost:3000/api/keys/test
 *
 * This will be removed before production launch.
 */
async function dispenseTestKey(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized — please log in first' },
                { status: 401 }
            )
        }

        // 1. Find every existing key for this user (so we can purge their cache entries)
        const existing = await prisma.apiKey.findMany({
            where: { userId: user.userId },
            select: { id: true, prefix: true }
        })

        // 2. Hard-delete them
        const deleted = await prisma.apiKey.deleteMany({
            where: { userId: user.userId }
        })

        // 3. Invalidate Redis cache for the deleted prefixes (best-effort)
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

        // 4. Audit the wipe
        await auditLogger.log(user.userId, 'ADMIN_ACTION', {
            action: 'TEST_KEY_DISPENSER_WIPE',
            deletedCount: deleted.count,
            resourceType: 'api_key',
            note: 'Test endpoint hard-deleted all user keys before minting a new one'
        })

        // 5. Mint a fresh LIVE key with default permissions
        const apiKey = await createApiKey({
            userId: user.userId,
            name: 'test-dispenser-key',
            permissions: ['read', 'numbers', 'sms'],
            tier: 'FREE' as ApiTier
        })

        await auditLogger.log(user.userId, 'API_KEY_CREATE', {
            keyId: apiKey.id,
            resourceType: 'api_key',
            resourceId: apiKey.id,
            source: 'test-dispenser'
        })

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

export async function GET(request: Request) {
    return dispenseTestKey(request)
}

export async function POST(request: Request) {
    return dispenseTestKey(request)
}
