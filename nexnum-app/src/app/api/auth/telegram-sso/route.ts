import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import crypto from 'crypto'
import { generateToken } from '@/lib/auth/jwt'

/**
 * Validates Telegram Mini App initData HMAC-SHA256 signature
 */
function verifyTelegramWebAppData(initData: string, botToken: string): { isValid: boolean; user?: any } {
    try {
        const urlParams = new URLSearchParams(initData)
        const hash = urlParams.get('hash')
        if (!hash) return { isValid: false }

        urlParams.delete('hash')

        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, val]) => `${key}=${val}`)
            .join('\n')

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

        if (calculatedHash.toLowerCase() === hash.toLowerCase()) {
            const userStr = urlParams.get('user')
            const user = userStr ? JSON.parse(userStr) : null
            return { isValid: true, user }
        }
    } catch (err) {
        console.error('[Telegram SSO] initData parsing error:', err)
    }
    return { isValid: false }
}

/**
 * POST /api/auth/telegram-sso
 * Validates Telegram Mini App initData and logs user in seamlessly (SSO)
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { initData } = body

        if (!initData) {
            return NextResponse.json({ error: 'Missing initData parameter' }, { status: 400 })
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN
        if (!botToken) {
            return NextResponse.json({ error: 'Telegram Bot Token is not configured' }, { status: 500 })
        }

        const verification = verifyTelegramWebAppData(initData, botToken)
        if (!verification.isValid || !verification.user?.id) {
            return NextResponse.json({ error: 'Invalid or forged Telegram initData signature' }, { status: 401 })
        }

        const tgUser = verification.user
        const telegramId = String(tgUser.id)
        const firstName = tgUser.first_name || 'Telegram User'

        // Find existing user by telegram_id
        let user = await prisma.user.findFirst({
            where: { telegramId }
        })

        if (!user) {
            // Auto-register new user via Telegram SSO
            const placeholderEmail = `tg_${telegramId}@telegram.nexnum.in`
            const randomPassword = crypto.randomBytes(32).toString('hex')

            user = await prisma.user.create({
                data: {
                    email: placeholderEmail,
                    passwordHash: randomPassword,
                    name: firstName,
                    telegramId,
                    wallet: {
                        create: {
                            balance: 0
                        }
                    }
                }
            })
        }

        // Generate JWT Auth Token using project standard jose helper
        const token = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
            version: user.tokenVersion
        })

        const response = NextResponse.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                telegramId: user.telegramId
            },
            token
        })

        // Set secure HTTP-only auth cookie
        response.cookies.set({
            name: 'auth_token',
            value: token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60
        })

        return response

    } catch (err: any) {
        console.error('[Telegram SSO] Authentication error:', err)
        return NextResponse.json({ error: 'Telegram SSO failed' }, { status: 500 })
    }
}
