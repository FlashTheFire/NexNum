/**
 * Google OAuth Callback Endpoint (Production Grade)
 * 
 * Handles OAuth callback with CSRF state verification.
 * Creates/links user account, sets emailVerified for OAuth users,
 * creates wallet, and issues session token.
 * 
 * Security:
 * - State parameter CSRF check
 * - Banned user validation
 * - Audit logging
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma, ensureWallet } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { getOAuthSettings } from '@/lib/auth/settings'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, enabled } = await getOAuthSettings('google')

    if (!enabled || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/google/callback`
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'

    // 1. CSRF: Verify state parameter
    const cookieStore = await cookies()
    const storedState = cookieStore.get('oauth_state')?.value

    if (!state || !storedState || state !== storedState) {
        logger.warn('[GoogleAuth] CSRF state mismatch', { provided: state, stored: storedState })
        return NextResponse.redirect(new URL('/auth/login?error=InvalidState', request.url))
    }

    // Clear the state cookie
    cookieStore.delete('oauth_state')

    if (!code) {
        return NextResponse.redirect(new URL('/auth/login?error=NoCode', request.url))
    }

    try {
        // 2. Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        })

        const tokens = await tokenResponse.json()
        if (!tokens.access_token) {
            logger.error('[GoogleAuth] Failed to get tokens', { error: tokens })
            return NextResponse.redirect(new URL('/auth/login?error=TokenExchangeFailed', request.url))
        }

        // 3. Get User Info from Google
        const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        const googleUser = await userResp.json()

        if (!googleUser.id || !googleUser.email) {
            logger.error('[GoogleAuth] Invalid user data from Google', { googleUser })
            return NextResponse.redirect(new URL('/auth/login?error=InvalidUserData', request.url))
        }

        // 4. Find or Create User
        let user = await prisma.user.findUnique({
            where: { email: googleUser.email }
        })

        let isNewUser = false

        if (user) {
            // Check if banned
            if (user.isBanned) {
                logger.warn('[GoogleAuth] Banned user attempted OAuth login', { userId: user.id })
                return NextResponse.redirect(new URL('/auth/login?error=AccountSuspended', request.url))
            }

            // Link Google ID if not already linked
            if (!user.googleId) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        googleId: googleUser.id,
                        image: user.image || googleUser.picture,
                        // If email wasn't verified before, verify it now (Google verified it)
                        emailVerified: user.emailVerified || new Date()
                    }
                })
            }
        } else {
            // Create new user
            user = await prisma.user.create({
                data: {
                    name: googleUser.name || googleUser.given_name || 'User',
                    email: googleUser.email,
                    googleId: googleUser.id,
                    image: googleUser.picture,
                    passwordHash: uuidv4(), // Placeholder (OAuth users don't have password)
                    role: 'USER',
                    emailVerified: new Date() // Google has already verified the email
                }
            })

            await ensureWallet(user.id)
            isNewUser = true
        }

        // 5. Create Session Token
        const token = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
            version: user.tokenVersion
        })

        await setAuthCookie(token)

        // 6. Audit Log
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: isNewUser ? 'oauth.signup' : 'oauth.login',
                resourceType: 'user',
                resourceId: user.id,
                ipAddress: ip,
                metadata: { provider: 'google' }
            }
        })

        logger.info('[GoogleAuth] Success', { userId: user.id, isNewUser })
        return NextResponse.redirect(new URL('/dashboard', request.url))

    } catch (error) {
        logger.error('[GoogleAuth] Critical Error', { error })
        return NextResponse.redirect(new URL('/auth/login?error=ServerError', request.url))
    }
}
