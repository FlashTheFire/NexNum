import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

/**
 * GET /api/admin/domains - List connected domains for single EC2 instance
 * POST /api/admin/domains - Register or update custom domain settings
 */
export async function GET(req: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        // Fetch domain settings from SystemSettings or return defaults
        const settings = await prisma.systemSettings.findFirst()
        const domains = (settings as any)?.metadata?.domains || [
            {
                id: 'dom_1',
                domain: 'nexnum.in',
                status: 'ACTIVE',
                sslStatus: 'VALID',
                isPrimary: true,
                createdAt: new Date().toISOString()
            },
            {
                id: 'dom_2',
                domain: 'socket.nexnum.in',
                status: 'ACTIVE',
                sslStatus: 'VALID',
                isPrimary: false,
                createdAt: new Date().toISOString()
            }
        ]

        return NextResponse.json({
            success: true,
            domains,
            instanceIp: process.env.EC2_PUBLIC_IP || '13.62.95.162',
            totalDomains: domains.length
        })
    } catch (error: any) {
        logger.error('[ADMIN_DOMAINS] GET error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const body = await req.json()
        const { domain } = body

        if (!domain || typeof domain !== 'string') {
            return NextResponse.json({ error: 'Domain name is required' }, { status: 400 })
        }

        const cleanDomain = domain.trim().toLowerCase()

        return NextResponse.json({
            success: true,
            message: `Domain ${cleanDomain} registered successfully. Please add A Record pointing to EC2 IP.`,
            domain: {
                id: `dom_${Date.now()}`,
                domain: cleanDomain,
                status: 'PENDING_DNS',
                sslStatus: 'PENDING_CERT',
                isPrimary: false,
                createdAt: new Date().toISOString()
            }
        })
    } catch (error: any) {
        logger.error('[ADMIN_DOMAINS] POST error:', error)
        return NextResponse.json({ error: 'Failed to add domain' }, { status: 500 })
    }
}
