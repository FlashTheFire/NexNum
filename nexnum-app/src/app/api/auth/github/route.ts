/**
 * GitHub OAuth Initiation Endpoint
 * 
 * Initiates GitHub OAuth flow with CSRF protection via state parameter.
 * State is stored in a secure httpOnly cookie and verified in callback.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID

    if (!GITHUB_CLIENT_ID) {
        return NextResponse.json(
            { error: 'GitHub OAuth not configured' },
            { status: 500 }
        )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/github/callback`
    const scope = 'read:user user:email'

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

    const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: scope,
        state: state,
        allow_signup: 'true'
    })

    return NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
}
