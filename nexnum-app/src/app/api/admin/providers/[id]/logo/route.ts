
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { AuthGuard } from '@/lib/auth/guard'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    const { id } = await params

    try {
        const provider = await prisma.provider.findUnique({ where: { id } })
        if (!provider) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
        }

        const formData = await req.formData()
        const file = formData.get('logo') as File | null

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        }

        // Validate file type
        const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Invalid file type. Allowed: PNG, JPG, SVG, WebP' }, { status: 400 })
        }

        // Max 2MB
        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large. Max 2MB' }, { status: 400 })
        }

        // Generate filename
        const ext = file.name.split('.').pop() || 'png'
        const filename = `${provider.name}.${ext}`

        // Ensure directory exists
        const uploadDir = path.join(process.cwd(), 'public', 'providers')
        await mkdir(uploadDir, { recursive: true })

        // Write file
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const filePath = path.join(uploadDir, filename)
        await writeFile(filePath, buffer)

        // Update provider with logo URL
        const logoUrl = `/providers/${filename}`
        await prisma.provider.update({
            where: { id },
            data: { logoUrl }
        })

        // Audit log the upload
        await logAdminAction({
            userId: auth.user.userId,
            action: 'PROVIDER_UPDATE',
            resourceType: 'Provider',
            resourceId: id,
            metadata: { action: 'logo_upload', filename },
            ipAddress: getClientIP(req)
        })

        return NextResponse.json({ logoUrl, message: 'Logo uploaded successfully' })
    } catch (error: any) {
        console.error('Logo upload failed:', error)
        return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 })
    }
}
