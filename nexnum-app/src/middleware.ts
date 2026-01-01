import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { rateLimiters } from '@/lib/ratelimit'

export async function middleware(request: NextRequest) {
    const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1'
    const { pathname } = request.nextUrl

    // -------------------------------------------------------------
    // 1. Security Headers (Production Grade)
    // -------------------------------------------------------------
    const headers = new Headers(request.headers)
    const response = NextResponse.next({
        request: {
            headers,
        },
    })

    response.headers.set('X-DNS-Prefetch-Control', 'on')
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'origin-when-cross-origin')

    // -------------------------------------------------------------
    // 2. Rate Limiting Strategy
    // -------------------------------------------------------------
    // Exclude static assets/internal routes from rate limiting
    if (!pathname.startsWith('/_next') && !pathname.includes('.')) {
        let success = true

        // Strict limiting for Auth routes
        if (pathname.startsWith('/api/auth')) {
            const result = await rateLimiters.auth.limit(ip)
            success = result.success
            response.headers.set('X-RateLimit-Limit', result.limit.toString())
            response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
        }
        // Strict limiting for Transactions (Buy/SMS)
        else if (pathname.startsWith('/api/sms') || pathname.startsWith('/api/wallet')) {
            const result = await rateLimiters.transaction.limit(ip)
            success = result.success
        }
        // General API limiting
        else if (pathname.startsWith('/api')) {
            const result = await rateLimiters.api.limit(ip)
            success = result.success
        }

        if (!success) {
            return new NextResponse(JSON.stringify({ error: 'Too Many Requests' }), {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'X-RateLimit-Reset': '1', // Hint to client
                }
            })
        }
    }

    // -------------------------------------------------------------
    // 3. Admin & Protected Route Guards
    // -------------------------------------------------------------
    if (pathname.startsWith('/admin')) {
        const token = request.cookies.get('token')?.value

        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url))
        }

        try {
            const payload = await verifyToken(token)
            if (!payload || payload.role !== 'ADMIN') {
                console.warn(`[Security] Unauthorized Admin Access Attempt: ${ip}`)
                return NextResponse.redirect(new URL('/dashboard', request.url))
            }
        } catch (error) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
    }

    if (pathname.startsWith('/dashboard')) {
        const token = request.cookies.get('token')?.value
        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url))
        }

        // Optional: Verify token existence for dashboard (stateless check)
        // For deep verification, we rely on the API routes/layout to fetch user data
    }

    return response
}

export const config = {
    // Apply to all routes except static assets
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
