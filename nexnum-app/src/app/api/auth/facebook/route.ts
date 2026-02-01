/**
 * Facebook OAuth 2.0 Initiation Endpoint
 * 
 * Initiates Facebook OAuth flow with state parameter for CSRF protection.
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

    const FACEBOOK_CLIENT_ID = settings?.oauth?.facebook?.clientId || process.env.FACEBOOK_CLIENT_ID

    if (!FACEBOOK_CLIENT_ID) {
        return NextResponse.json(
            { error: 'Facebook OAuth not configured' },
            { status: 500 }
        )
    }

    if (!settings?.oauth?.facebook?.enabled) {
        return NextResponse.json(
            { error: 'Facebook login is not enabled' },
            { status: 403 }
        )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/facebook/callback`

    // Facebook OAuth 2.0 scopes
    const scope = 'email public_profile'

    // Generate CSRF state token
    const state = crypto.randomUUID()

    // Store state in cookie
    const cookieStore = await cookies()
    cookieStore.set('facebook_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/'
    })

    const authUrl = 'https://www.facebook.com/v18.0/dialog/oauth'
    const params = new URLSearchParams({
        client_id: FACEBOOK_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: scope,
        state: state,
        response_type: 'code'
    })

    return NextResponse.redirect(`${authUrl}?${params.toString()}`)
}
