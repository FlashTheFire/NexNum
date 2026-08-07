import { NextRequest, NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'

const BOT_GATEWAY_URL = process.env.NEXNUM_BOT_URL || 'http://nexnum-bot:8080'
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || process.env.NEXNUM_API_KEY || '9da2cb070956a4466cefffa033a18bb90485fc3f1dc8c5ac1bfad4651f377a86'

/**
 * Proxy route for nexnum-app admin panel to manage nexnum-bot SMS gateway safely.
 * Server-side RBAC enforced via AuthGuard.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await AuthGuard.tryUser()
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
        }

        const path = request.nextUrl.searchParams.get('endpoint') || '/api/v1/admin/stats'
        const targetUrl = `${BOT_GATEWAY_URL}${path}`

        const res = await fetch(targetUrl, {
            headers: {
                'X-API-Key': ADMIN_API_KEY,
                'Content-Type': 'application/json',
            },
            next: { revalidate: 0 },
        })

        if (!res.ok) {
            const errText = await res.text()
            return NextResponse.json({ error: `Gateway returned ${res.status}: ${errText}` }, { status: res.status })
        }

        const data = await res.json()
        return NextResponse.json(data)
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to communicate with SMS gateway' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await AuthGuard.tryUser()
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
        }

        const body = await request.json()
        const endpoint = body.endpoint || '/api/v1/admin/test-match'
        const payload = body.payload || {}

        const targetUrl = `${BOT_GATEWAY_URL}${endpoint}`

        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'X-API-Key': ADMIN_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const errText = await res.text()
            return NextResponse.json({ error: `Gateway returned ${res.status}: ${errText}` }, { status: res.status })
        }

        const data = await res.json()
        return NextResponse.json(data)
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Failed to execute gateway action' }, { status: 500 })
    }
}
