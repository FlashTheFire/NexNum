import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID

    if (!GOOGLE_CLIENT_ID) {
        return NextResponse.json({ error: 'Google Client ID not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/auth/google/callback`

    const scope = 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email'

    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
    const options = {
        redirect_uri: redirectUri,
        client_id: GOOGLE_CLIENT_ID,
        access_type: 'offline',
        response_type: 'code',
        scope: scope,
    }

    const qs = new URLSearchParams(options)
    return NextResponse.redirect(`${rootUrl}?${qs.toString()}`)
}
