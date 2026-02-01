/**
 * Twitter OAuth 2.0 Callback Handler
 * 
 * Handles the callback from Twitter OAuth, exchanges code for tokens,
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
    const storedState = cookieStore.get('twitter_oauth_state')?.value
    const codeVerifier = cookieStore.get('twitter_code_verifier')?.value

    // Clear OAuth cookies
    cookieStore.delete('twitter_oauth_state')
    cookieStore.delete('twitter_code_verifier')

    // Error from Twitter
    if (error) {
        return NextResponse.redirect(new URL(`/auth/login?error=${error}`, request.url))
    }

    // Validate state (CSRF protection)
    if (!state || state !== storedState) {
        return NextResponse.redirect(new URL('/auth/login?error=invalid_state', request.url))
    }

    if (!code || !codeVerifier) {
        return NextResponse.redirect(new URL('/auth/login?error=missing_code', request.url))
    }

    try {
        // Get client credentials from settings
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : null

        const TWITTER_CLIENT_ID = settings?.oauth?.twitter?.clientId || process.env.TWITTER_CLIENT_ID
        const TWITTER_CLIENT_SECRET = settings?.oauth?.twitter?.clientSecret || process.env.TWITTER_CLIENT_SECRET

        if (!TWITTER_CLIENT_ID) {
            throw new Error('Twitter OAuth not configured')
        }

        const origin = new URL(request.url).origin
        const redirectUri = `${origin}/api/auth/twitter/callback`

        // Exchange code for access token
        const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...(TWITTER_CLIENT_SECRET && {
                    'Authorization': `Basic ${btoa(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`)}`
                })
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
                client_id: TWITTER_CLIENT_ID
            })
        })

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text()
            console.error('[Twitter OAuth] Token error:', errorData)
            throw new Error('Failed to exchange code for token')
        }

        const tokens = await tokenResponse.json()

        // Get user info
        const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username', {
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`
            }
        })

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user info')
        }

        const { data: twitterUser } = await userResponse.json()

        // Find or create user
        let user = await prisma.user.findFirst({
            where: {
                twitterId: twitterUser.id
            }
        })

        if (!user) {
            // Create new user
            user = await prisma.user.create({
                data: {
                    name: twitterUser.name,
                    email: `${twitterUser.username}@twitter.placeholder`,
                    passwordHash: uuidv4(), // Placeholder for OAuth users
                    twitterId: twitterUser.id,
                    image: twitterUser.profile_image_url?.replace('_normal', '_400x400'),
                    emailVerified: null,
                    role: 'USER'
                }
            })

            await ensureWallet(user.id)
        } else if (!user.twitterId) {
            // Link Twitter to existing account
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    twitterId: twitterUser.id,
                    image: user.image || twitterUser.profile_image_url?.replace('_normal', '_400x400')
                }
            })
        }

        // Generate session token
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
        console.error('[Twitter OAuth] Error:', error)
        return NextResponse.redirect(new URL(`/auth/login?error=oauth_failed`, request.url))
    }
}
