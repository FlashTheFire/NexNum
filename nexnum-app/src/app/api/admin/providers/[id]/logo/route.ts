
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { AuthGuard } from '@/lib/auth/guard'
import { logAdminAction, getClientIP } from '@/lib/core/auditLog'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

/**
 * Magic-byte image type sniffer. Returns MIME or null.
 * More trustworthy than the client-supplied Content-Type.
 */
function sniffImageType(buf: Buffer): string | null {
    if (buf.length < 4) return null
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg'
    // GIF: 47 49 46 38
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'
    // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF....WEBP)
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
    return null
}

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

        // Read first bytes for magic-byte sniffing (don't trust client MIME)
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const sniffedType = sniffImageType(buffer)

        // Only allow raster images — SVG banned due to XSS risk.
        // SVG can contain <script> and is executed by browsers when served as image/svg+xml.
        const allowedTypes: Record<string, string> = {
            png: 'image/png',
            jpeg: 'image/jpeg',
            jpg: 'image/jpeg',
            webp: 'image/webp',
            gif: 'image/gif',
        }
        if (!sniffedType || !Object.values(allowedTypes).includes(sniffedType)) {
            return NextResponse.json({ error: 'Invalid file. Only PNG, JPG, WebP, GIF allowed (no SVG due to security).' }, { status: 400 })
        }

        // Max 2MB
        if (file.size > 2 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large. Max 2MB' }, { status: 400 })
        }

        // Generate filename from sniffed type, not client filename
        const ext = Object.keys(allowedTypes).find(k => allowedTypes[k] === sniffedType) || 'png'
        const safeName = provider.name.replace(/[^a-zA-Z0-9_-]/g, '_')
        const filename = `${safeName}.${ext}`

        // Ensure directory exists
        const uploadDir = path.join(process.cwd(), 'public', 'providers')
        await mkdir(uploadDir, { recursive: true })

        // Write file (buffer already created above for sniffing)
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
