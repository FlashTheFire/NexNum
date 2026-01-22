import { NextResponse } from 'next/server'
import { setCSRFCookie, CSRF_CONSTANTS } from '@/lib/security/csrf'

/**
 * GET /api/csrf
 * 
 * Returns a CSRF token for the client to use in subsequent requests.
 * The token is also set as a cookie.
 * 
 * This endpoint should be called before making state-changing requests (POST/PUT/DELETE).
 */
export async function GET() {
    try {
        const token = await setCSRFCookie()

        return NextResponse.json({
            success: true,
            token,
            headerName: CSRF_CONSTANTS.HEADER_NAME
        })
    } catch (error) {
        console.error('[CSRF] Failed to generate token:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to generate CSRF token' },
            { status: 500 }
        )
    }
}
