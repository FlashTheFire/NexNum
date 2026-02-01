/**
 * Facebook OAuth 2.0 Callback Handler
 * 
 * Handles the callback from Facebook OAuth, exchanges code for tokens,
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
    const storedState = cookieStore.get('facebook_oauth_state')?.value

    cookieStore.delete('facebook_oauth_state')

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

        const FACEBOOK_CLIENT_ID = settings?.oauth?.facebook?.clientId || process.env.FACEBOOK_CLIENT_ID
        const FACEBOOK_CLIENT_SECRET = settings?.oauth?.facebook?.clientSecret || process.env.FACEBOOK_CLIENT_SECRET

        if (!FACEBOOK_CLIENT_ID || !FACEBOOK_CLIENT_SECRET) {
            throw new Error('Facebook OAuth not configured')
        }

        const origin = new URL(request.url).origin
        const redirectUri = `${origin}/api/auth/facebook/callback`

        // Exchange code for access token
        const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token')
        tokenUrl.searchParams.set('client_id', FACEBOOK_CLIENT_ID)
        tokenUrl.searchParams.set('client_secret', FACEBOOK_CLIENT_SECRET)
        tokenUrl.searchParams.set('redirect_uri', redirectUri)
        tokenUrl.searchParams.set('code', code)

        const tokenResponse = await fetch(tokenUrl.toString())

        if (!tokenResponse.ok) {
            console.error('[Facebook OAuth] Token error:', await tokenResponse.text())
            throw new Error('Failed to exchange code for token')
        }

        const tokens = await tokenResponse.json()

        // Get user info
        const userUrl = new URL('https://graph.facebook.com/v18.0/me')
        userUrl.searchParams.set('fields', 'id,name,email,picture.width(200).height(200)')
        userUrl.searchParams.set('access_token', tokens.access_token)

        const userResponse = await fetch(userUrl.toString())

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user info')
        }

        const facebookUser = await userResponse.json()
        const pictureUrl = facebookUser.picture?.data?.url || null

        // Find or create user
        let user = await prisma.user.findFirst({
            where: {
                OR: [
                    { facebookId: facebookUser.id },
                    ...(facebookUser.email ? [{ email: facebookUser.email }] : [])
                ]
            }
        })

        if (!user) {
            user = await prisma.user.create({
                data: {
                    name: facebookUser.name,
                    email: facebookUser.email || `${facebookUser.id}@facebook.placeholder`,
                    passwordHash: uuidv4(),
                    facebookId: facebookUser.id,
                    image: pictureUrl,
                    emailVerified: facebookUser.email ? new Date() : null,
                    role: 'USER'
                }
            })

            await ensureWallet(user.id)
        } else if (!user.facebookId) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    facebookId: facebookUser.id,
                    image: user.image || pictureUrl
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
        console.error('[Facebook OAuth] Error:', error)
        return NextResponse.redirect(new URL(`/auth/login?error=oauth_failed`, request.url))
    }
}
