/**
 * Discord OAuth 2.0 Callback Handler
 * 
 * Handles the callback from Discord OAuth, exchanges code for tokens,
 * fetches user info, and creates/links user account.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma, ensureWallet } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { redis } from '@/lib/core/redis'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    const cookieStore = await cookies()
    const storedState = cookieStore.get('discord_oauth_state')?.value

    // Clear OAuth cookie
    cookieStore.delete('discord_oauth_state')

    if (error) {
        return NextResponse.redirect(new URL(`/auth/login?error=${error}`, request.url))
    }

    if (!state || state !== storedState) {
        return NextResponse.redirect(new URL('/auth/login?error=invalid_state', request.url))
    }

    if (!code) {
        return NextResponse.redirect(new URL('/auth/login?error=missing_code', request.url))
    }

    try {
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : null

        const DISCORD_CLIENT_ID = settings?.oauth?.discord?.clientId || process.env.DISCORD_CLIENT_ID
        const DISCORD_CLIENT_SECRET = settings?.oauth?.discord?.clientSecret || process.env.DISCORD_CLIENT_SECRET

        if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
            throw new Error('Discord OAuth not configured')
        }

        const origin = new URL(request.url).origin
        const redirectUri = `${origin}/api/auth/discord/callback`

        // Exchange code for access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET
            })
        })

        if (!tokenResponse.ok) {
            console.error('[Discord OAuth] Token error:', await tokenResponse.text())
            throw new Error('Failed to exchange code for token')
        }

        const tokens = await tokenResponse.json()

        // Get user info
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { 'Authorization': `Bearer ${tokens.access_token}` }
        })

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user info')
        }

        const discordUser = await userResponse.json()

        const avatarUrl = discordUser.avatar
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`

        // Find or create user
        let user = await prisma.user.findFirst({
            where: {
                OR: [
                    { discordId: discordUser.id },
                    ...(discordUser.email ? [{ email: discordUser.email }] : [])
                ]
            }
        })

        if (!user) {
            user = await prisma.user.create({
                data: {
                    name: discordUser.global_name || discordUser.username,
                    email: discordUser.email || `${discordUser.id}@discord.placeholder`,
                    passwordHash: uuidv4(),
                    discordId: discordUser.id,
                    image: avatarUrl,
                    emailVerified: discordUser.verified ? new Date() : null,
                    role: 'USER'
                }
            })

            await ensureWallet(user.id)
        } else if (!user.discordId) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    discordId: discordUser.id,
                    image: user.image || avatarUrl
                }
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
        console.error('[Discord OAuth] Error:', error)
        return NextResponse.redirect(new URL(`/auth/login?error=oauth_failed`, request.url))
    }
}
