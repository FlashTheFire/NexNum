import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { prisma } from '@/lib/core/db';
import crypto from 'crypto';

let cachedBotUsername: string | null = null;

/**
 * Fetch bot username automatically from Telegram Official API (getMe)
 */
async function getBotUsername(): Promise<string> {
    if (cachedBotUsername) return cachedBotUsername;
    if (process.env.TELEGRAM_BOT_USERNAME) {
        cachedBotUsername = process.env.TELEGRAM_BOT_USERNAME.replace(/[^a-zA-Z0-9_]/g, '');
        return cachedBotUsername;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return 'NexNumBot';

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        });
        const data = await res.json();
        if (data.ok && data.result?.username) {
            cachedBotUsername = String(data.result.username).replace(/[^a-zA-Z0-9_]/g, '');
            return cachedBotUsername;
        }
    } catch (err) {
        console.error('[Telegram API Security] getMe fetch error:', err);
    }
    return 'NexNumBot';
}

/**
 * POST /api/user/link-telegram
 * Generates a 1-click deep-link token to connect user's Web App profile to Telegram Bot.
 * Security: Authenticated Web Session + High Entropy Crypto Token + 10 min TTL.
 */
export async function POST(request: NextRequest) {
    const { userId, error } = await requireUser(request);
    if (error || !userId) {
        return NextResponse.json(
            { error: 'Unauthorized session' },
            { status: 401, headers: { 'Cache-Control': 'no-store, private' } }
        );
    }

    try {
        const botUsername = await getBotUsername();
        // High-entropy 128-bit cryptographic token (16 bytes = 32 hex chars)
        const token = `LINK-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;

        await prisma.$executeRaw`
            INSERT INTO account_link_tokens (token, user_id, expires_at)
            VALUES (${token}, ${userId}, NOW() + INTERVAL '10 minutes')
            ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at
        `;

        const link = `https://t.me/${botUsername}?start=link_${token}`;

        return NextResponse.json(
            {
                success: true,
                botUsername,
                token,
                link,
                expiresInSeconds: 600
            },
            {
                status: 200,
                headers: {
                    'Cache-Control': 'no-store, private',
                    'X-Content-Type-Options': 'nosniff'
                }
            }
        );
    } catch (err: any) {
        console.error('[Link Telegram Security] API error:', err);
        return NextResponse.json(
            { error: 'Failed to generate secure link token' },
            { status: 500, headers: { 'Cache-Control': 'no-store, private' } }
        );
    }
}
