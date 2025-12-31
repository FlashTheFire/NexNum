import { NextResponse } from 'next/server'
import { syncProviderData } from '@/lib/provider-sync'
import { verifyToken } from '@/lib/jwt'

// Helper to check admin
async function isAdmin(request: Request) {
    const token = request.headers.get('cookie')?.split('token=')[1]?.split(';')[0]
    if (!token) return false
    const payload = await verifyToken(token)
    return payload?.role === 'ADMIN'
}

export async function POST(request: Request) {
    if (!await isAdmin(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { provider } = body

        if (!provider) {
            return NextResponse.json({ error: 'Provider required' }, { status: 400 })
        }

        // Trigger sync asynchronously (or await if fast, but usually slow)
        // For admin feedback, we might want to await partially or return "Started".
        // provider-sync functions are usually long-running.

        // We will await it for now to give direct feedback, but in production simpler to decouple.
        console.log(`Starting Admin Sync for ${provider}...`)

        // Map frontend ID to internal Provider Name if needed, or pass directly
        const result = await syncProviderData(provider)

        return NextResponse.json({
            success: true,
            message: `Sync completed for ${provider}`,
            stats: result
        })

    } catch (error) {
        console.error("Sync Error:", error)
        return NextResponse.json({ error: 'Sync failed: ' + (error as Error).message }, { status: 500 })
    }
}
