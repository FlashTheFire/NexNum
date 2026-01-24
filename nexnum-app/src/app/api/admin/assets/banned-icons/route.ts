import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const icons = await (prisma as any).bannedIcon.findMany({
        orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(icons)
}

export async function POST(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const { hash, description } = await request.json()
        if (!hash) return NextResponse.json({ error: "Hash is required" }, { status: 400 })

        const icon = await (prisma as any).bannedIcon.upsert({
            where: { hash },
            create: { hash, description },
            update: { description }
        })
        return NextResponse.json(icon)
    } catch (e) {
        return NextResponse.json({ error: "Failed to add icon" }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

        await (prisma as any).bannedIcon.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (e) {
        return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
    }
}
