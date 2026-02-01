/**
 * Discord OAuth 2.0 Initiation Endpoint
 * 
 * Initiates Discord OAuth flow with state parameter for CSRF protection.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { redis } from '@/lib/core/redis'

export const dynamic = 'force-dynamic'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

export async function GET(request: Request) {
    // Get settings from Redis
    const stored = await redis.get(AUTH_SETTINGS_KEY)
    const settings = stored ? JSON.parse(stored) : null

    const DISCORD_CLIENT_ID = settings?.oauth?.discord?.clientId || process.env.DISCORD_CLIENT_ID

    if (!DISCORD_CLIENT_ID) {
        return NextResponse.json(
            { error: 'Discord OAuth not configured' },
            { status: 500 }
        )
    }

    if (!settings?.oauth?.discord?.enabled) {
        return NextResponse.json(
            { error: 'Discord login is not enabled' },
            { status: 403 }
        )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/discord/callback`

    // Discord OAuth 2.0 scopes
    const scope = 'identify email'

    // Generate CSRF state token
    const state = crypto.randomUUID()

    // Store state in cookie
    const cookieStore = await cookies()
    cookieStore.set('discord_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/'
    })

    const authUrl = 'https://discord.com/api/oauth2/authorize'
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: scope,
        state: state
    })

    return NextResponse.redirect(`${authUrl}?${params.toString()}`)
}
