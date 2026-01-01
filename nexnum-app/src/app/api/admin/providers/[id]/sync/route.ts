
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncProviderData } from '@/lib/provider-sync'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/jwt'

async function verifyAdmin() {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return null
    try {
        const payload = await verifyToken(token)
        if (payload?.role === 'ADMIN') return payload
        return null
    } catch {
        return null
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await verifyAdmin()
    if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    try {
        const provider = await prisma.provider.findUnique({ where: { id } })
        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        const result = await syncProviderData(provider.name)
        return NextResponse.json(result)
    } catch (error: any) {
        console.error('Sync trigger failed:', error)
        return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 })
    }
}
