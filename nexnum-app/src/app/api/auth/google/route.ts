/**
 * Google OAuth Initiation Endpoint (Production Grade)
 * 
 * Initiates Google OAuth flow with CSRF protection via state parameter.
 * State is stored in a secure httpOnly cookie and verified in callback.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOAuthSettings } from '@/lib/auth/settings'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { clientId: GOOGLE_CLIENT_ID, enabled } = await getOAuthSettings('google')

    if (!enabled || !GOOGLE_CLIENT_ID) {
        return NextResponse.json(
            { error: 'Google OAuth not configured' },
            { status: 500 }
        )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/google/callback`
    const scope = 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email'

    // Generate CSRF state token
    const state = crypto.randomUUID()

    // Set state in secure httpOnly cookie (valid for 10 minutes)
    const cookieStore = await cookies()
    cookieStore.set('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/'
    })

    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
    const params = new URLSearchParams({
        redirect_uri: redirectUri,
        client_id: GOOGLE_CLIENT_ID,
        access_type: 'offline',
        response_type: 'code',
        scope: scope,
        state: state, // CSRF protection
        prompt: 'consent' // Always show consent screen for refresh token
    })

    return NextResponse.redirect(`${rootUrl}?${params.toString()}`)
}
