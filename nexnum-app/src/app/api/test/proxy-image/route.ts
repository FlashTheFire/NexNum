import { NextResponse } from 'next/server'
import { proxyImage } from '@/lib/image-proxy'

/**
 * GET /api/test/proxy-image
 * Test the image proxy functionality
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const url = searchParams.get('url') || 'https://flagcdn.com/w40/us.png'

    try {
        const result = await proxyImage(url)
        return NextResponse.json({
            original: url,
            ...result,
            testTime: new Date().toISOString()
        })
    } catch (error) {
        return NextResponse.json({
            error: (error as Error).message,
            original: url
        }, { status: 500 })
    }
}
