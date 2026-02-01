/**
 * Twitter OAuth 2.0 Initiation Endpoint
 * 
 * Initiates Twitter OAuth flow with PKCE and state parameter.
 * Uses OAuth 2.0 with PKCE (no client secret required for public clients).
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

    const TWITTER_CLIENT_ID = settings?.oauth?.twitter?.clientId || process.env.TWITTER_CLIENT_ID

    if (!TWITTER_CLIENT_ID) {
        return NextResponse.json(
            { error: 'Twitter OAuth not configured' },
            { status: 500 }
        )
    }

    if (!settings?.oauth?.twitter?.enabled) {
        return NextResponse.json(
            { error: 'Twitter login is not enabled' },
            { status: 403 }
        )
    }

    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/twitter/callback`

    // Twitter OAuth 2.0 scopes
    const scope = 'tweet.read users.read'

    // Generate CSRF state token
    const state = crypto.randomUUID()

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    // Store state and code verifier in cookies
    const cookieStore = await cookies()
    cookieStore.set('twitter_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/'
    })
    cookieStore.set('twitter_code_verifier', codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/'
    })

    const authUrl = 'https://twitter.com/i/oauth2/authorize'
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: TWITTER_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: scope,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    })

    return NextResponse.redirect(`${authUrl}?${params.toString()}`)
}

// PKCE Helpers
function generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return base64UrlEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return base64UrlEncode(new Uint8Array(digest))
}

function base64UrlEncode(buffer: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...buffer))
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
