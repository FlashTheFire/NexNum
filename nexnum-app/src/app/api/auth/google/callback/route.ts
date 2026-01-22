import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/google/callback`

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 })
    }

    try {
        // 1. Exchange code for tokens
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
            console.error('[GoogleAuth] Failed to get tokens:', tokens)
            return NextResponse.redirect(new URL('/login?error=GoogleAuthFailed', request.url))
        }

        // 2. Get User Info
        const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        const googleUser = await userResp.json()

        if (!googleUser.id || !googleUser.email) {
            return NextResponse.redirect(new URL('/login?error=GoogleAuthInvalidData', request.url))
        }

        // 3. Find or Create User
        let user = await prisma.user.findUnique({
            where: { email: googleUser.email }
        })

        if (user) {
            if (!user.googleId) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        googleId: googleUser.id,
                        image: user.image || googleUser.picture
                    }
                })
            }
        } else {
            user = await prisma.user.create({
                data: {
                    name: googleUser.name || googleUser.given_name || 'User',
                    email: googleUser.email,
                    googleId: googleUser.id,
                    image: googleUser.picture,
                    passwordHash: uuidv4(),
                    role: 'USER'
                }
            })
            await ensureWallet(user.id)
        }

        // 4. Create Session (Cookie)
        const token = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            version: user.tokenVersion
        })

        await setAuthCookie(token)

        return NextResponse.redirect(new URL('/dashboard', request.url))

    } catch (error) {
        console.error('[GoogleAuth] Critical Error:', error)
        return NextResponse.redirect(new URL('/login?error=ServerError', request.url))
    }
}
