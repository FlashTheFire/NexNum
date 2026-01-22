import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { createApiKey, listApiKeys, CreateApiKeyInput } from '@/lib/api/api-keys'
import { ApiTier } from '@prisma/client'

// GET /api/keys - List API keys
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const keys = await listApiKeys(user.userId)

        return NextResponse.json({
            success: true,
            keys
        })

    } catch (error) {
        console.error('List API keys error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/keys - Create API key
export async function POST(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { name } = body

        if (!name || typeof name !== 'string') {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        }

        // Default permissions for now
        const permissions = ['read', 'numbers', 'sms']

        // Determine tier (this should come from user subscription in real app)
        // For now, everyone is FREE unless admin overrides
        const tier: ApiTier = 'FREE'

        try {
            const apiKey = await createApiKey({
                userId: user.userId,
                name,
                permissions,
                tier,
                // Optional: rateLimit, expiresAt, ipWhitelist
            })

            return NextResponse.json({
                success: true,
                apiKey // Contains rawKey (only shown once)
            })
        } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 400 })
        }

    } catch (error) {
        console.error('Create API key error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
