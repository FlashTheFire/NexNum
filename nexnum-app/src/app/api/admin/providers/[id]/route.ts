
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await verifyAdmin()
    if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    try {
        const provider = await prisma.provider.findUnique({
            where: { id },
            include: {
                testResults: {
                    orderBy: { testedAt: 'desc' },
                    take: 10
                },
                syncJobs: {
                    orderBy: { startedAt: 'desc' },
                    take: 5
                }
            }
        })

        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        return NextResponse.json(provider)
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const admin = await verifyAdmin()
    if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    try {
        const body = await req.json()
        const provider = await prisma.provider.update({
            where: { id },
            data: {
                ...body,
                updatedAt: new Date()
            }
        })

        return NextResponse.json(provider)
    } catch (error) {
        console.error('Update failed:', error)
        return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

        // Protection logic
        if (provider.name === 'mock' || provider.priority === 999) { // System default
            return NextResponse.json({ error: 'Cannot delete system default provider.' }, { status: 403 })
        }

        if (provider.isActive) {
            return NextResponse.json({ error: 'Cannot delete an ACTIVE provider. Please deactivate it first.' }, { status: 400 })
        }

        const count = await prisma.provider.count()
        if (count <= 1) {
            return NextResponse.json({ error: 'Cannot delete the only existing provider.' }, { status: 400 })
        }

        await prisma.provider.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
}
