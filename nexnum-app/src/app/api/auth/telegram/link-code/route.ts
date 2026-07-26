import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { verifyAuth } from '@/lib/auth/jwt'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const payload = await verifyAuth(request)
        if (!payload || !payload.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = payload.id
        const shortCode = `link_${uuidv4().replace(/-/g, '').substring(0, 10)}`
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes TTL

        // Create table if missing and insert link token
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS account_links (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                code VARCHAR(64) UNIQUE NOT NULL,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `)

        await prisma.$executeRawUnsafe(
            `INSERT INTO account_links (code, user_id, expires_at) VALUES ($1, $2::uuid, $3)`,
            shortCode,
            userId,
            expiresAt
        )

        const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'NexNumBot'
        const linkUrl = `https://t.me/${botUsername}?start=${shortCode}`

        return NextResponse.json({
            success: true,
            code: shortCode,
            linkUrl,
            expiresAt: expiresAt.toISOString()
        })
    } catch (error: any) {
        console.error('[Telegram Link Code Error]:', error)
        return NextResponse.json({ error: 'Failed to generate link code' }, { status: 500 })
    }
}
