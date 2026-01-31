/**
 * GitHub OAuth Callback Endpoint
 * 
 * Handles OAuth callback with CSRF state verification.
 * Creates/links user account, sets emailVerified,
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
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
    const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        return NextResponse.json({ error: 'GitHub OAuth not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const origin = new URL(request.url).origin
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'

    // 1. CSRF: Verify state parameter
    const cookieStore = await cookies()
    const storedState = cookieStore.get('oauth_state')?.value

    if (!state || !storedState || state !== storedState) {
        logger.warn('[GitHubAuth] CSRF state mismatch', { provided: state, stored: storedState })
        return NextResponse.redirect(new URL('/auth/login?error=InvalidState', request.url))
    }

    // Clear the state cookie
    cookieStore.delete('oauth_state')

    if (!code) {
        return NextResponse.redirect(new URL('/auth/login?error=NoCode', request.url))
    }

    try {
        // 2. Exchange code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code: code
            }),
        })

        const tokens = await tokenResponse.json()
        if (!tokens.access_token) {
            logger.error('[GitHubAuth] Failed to get tokens', { error: tokens })
            return NextResponse.redirect(new URL('/auth/login?error=TokenExchangeFailed', request.url))
        }

        // 3. Get User Info from GitHub
        const userResp = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'NexNum-App'
            },
        })
        const githubUser = await userResp.json()

        // 4. Get user's primary email (might be private)
        let email = githubUser.email
        if (!email) {
            const emailsResp = await fetch('https://api.github.com/user/emails', {
                headers: {
                    Authorization: `Bearer ${tokens.access_token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'NexNum-App'
                },
            })
            const emails = await emailsResp.json()
            const primaryEmail = emails.find((e: any) => e.primary && e.verified)
            email = primaryEmail?.email
        }

        if (!githubUser.id || !email) {
            logger.error('[GitHubAuth] Invalid user data from GitHub', { githubUser })
            return NextResponse.redirect(new URL('/auth/login?error=InvalidUserData', request.url))
        }

        // 5. Find or Create User
        let user = await prisma.user.findUnique({
            where: { email: email }
        })

        let isNewUser = false

        if (user) {
            // Check if banned
            if (user.isBanned) {
                logger.warn('[GitHubAuth] Banned user attempted OAuth login', { userId: user.id })
                return NextResponse.redirect(new URL('/auth/login?error=AccountSuspended', request.url))
            }

            // Link GitHub ID if not already linked
            if (!user.githubId) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        githubId: String(githubUser.id),
                        image: user.image || githubUser.avatar_url,
                        emailVerified: user.emailVerified || new Date()
                    }
                })
            }
        } else {
            // Create new user
            user = await prisma.user.create({
                data: {
                    name: githubUser.name || githubUser.login || 'User',
                    email: email,
                    githubId: String(githubUser.id),
                    image: githubUser.avatar_url,
                    passwordHash: uuidv4(),
                    role: 'USER',
                    emailVerified: new Date()
                }
            })

            await ensureWallet(user.id)
            isNewUser = true
        }

        // 6. Create Session Token
        const token = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
            version: user.tokenVersion
        })

        await setAuthCookie(token)

        // 7. Audit Log
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: isNewUser ? 'oauth.signup' : 'oauth.login',
                resourceType: 'user',
                resourceId: user.id,
                ipAddress: ip,
                metadata: { provider: 'github' }
            }
        })

        logger.info('[GitHubAuth] Success', { userId: user.id, isNewUser })
        return NextResponse.redirect(new URL('/dashboard', request.url))

    } catch (error) {
        logger.error('[GitHubAuth] Critical Error', { error })
        return NextResponse.redirect(new URL('/auth/login?error=ServerError', request.url))
    }
}
