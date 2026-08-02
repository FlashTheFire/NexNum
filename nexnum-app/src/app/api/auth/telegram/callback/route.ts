/**
 * Telegram Login Widget Callback Handler
 * 
 * Verifies the Telegram Login Widget callback data using HMAC-SHA256.
 * See: https://core.telegram.org/widgets/login#checking-authorization
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma, ensureWallet } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { redis } from '@/lib/core/redis'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    let usedKey: string | null = null
    let keyReserved = false

    // Extract Telegram callback parameters
    const telegramData: Record<string, string> = {}
    searchParams.forEach((value, key) => {
        telegramData[key] = value
    })

    const hash = telegramData.hash
    delete telegramData.hash

    if (!hash) {
        return NextResponse.redirect(new URL('/auth/login?error=missing_hash', request.url))
    }

    usedKey = `v1:used_tg_hash:${hash}`

    try {
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : null

        const BOT_TOKEN = settings?.oauth?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN

        if (!BOT_TOKEN) {
            throw new Error('Telegram login not configured')
        }

        if (!settings?.oauth?.telegram?.enabled) {
            return NextResponse.redirect(new URL('/auth/login?error=telegram_disabled', request.url))
        }

        // Verify the hash
        const dataCheckArr = Object.keys(telegramData)
            .sort()
            .map(key => `${key}=${telegramData[key]}`)
        const dataCheckString = dataCheckArr.join('\n')

        const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest()
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex')

        if (calculatedHash !== hash) {
            console.error('[Telegram] Hash mismatch - potential tampering')
            return NextResponse.redirect(new URL('/auth/login?error=invalid_hash', request.url))
        }

        // Security Hardening: Enforce 5-minute (300s) max age for OAuth login callback
        const authDate = parseInt(telegramData.auth_date || '0', 10)
        const now = Math.floor(Date.now() / 1000)
        if (!authDate || now - authDate > 300 || authDate > now + 60) {
            return NextResponse.redirect(new URL('/auth/login?error=auth_expired', request.url))
        }

        // Security Hardening: Prevent Replay Attacks using Redis single-use hash key
        const isReserved = await redis.set(usedKey, '1', 'EX', 300, 'NX')
        if (!isReserved) {
            console.error('[Telegram] Replay attack detected for hash:', hash)
            return NextResponse.redirect(new URL('/auth/login?error=replay_attack_detected', request.url))
        }
        keyReserved = true

        const telegramUser = {
            id: telegramData.id,
            firstName: telegramData.first_name,
            lastName: telegramData.last_name || '',
            username: telegramData.username || '',
            photoUrl: telegramData.photo_url || ''
        }

        // Find or create user with standardized canonical email format
        let user = await prisma.user.findFirst({
            where: { telegramId: telegramUser.id }
        })

        if (!user) {
            const fullName = `${telegramUser.firstName} ${telegramUser.lastName}`.trim()
            user = await prisma.user.create({
                data: {
                    name: fullName,
                    email: `tg_${telegramUser.id}@telegram.nexnum.in`,
                    passwordHash: uuidv4(),
                    telegramId: telegramUser.id,
                    image: telegramUser.photoUrl || null,
                    emailVerified: null,
                    role: 'USER'
                }
            })

            await ensureWallet(user.id)
        } else if (telegramUser.photoUrl && telegramUser.photoUrl !== user.image) {
            await prisma.user.update({
                where: { id: user.id },
                data: { image: telegramUser.photoUrl }
            })
        }

        const token = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
            version: user.tokenVersion
        })

        await setAuthCookie(token)

        return NextResponse.redirect(new URL('/dashboard', request.url))
    } catch (error: any) {
        if (usedKey && keyReserved) {
            await redis.del(usedKey).catch(() => {})
        }
        console.error('[Telegram] Error:', error)
        return NextResponse.redirect(new URL(`/auth/login?error=oauth_failed`, request.url))
    }
}
