import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/jwt'

export async function middleware(request: NextRequest) {
    // 1. Check for Admin Routes
    if (request.nextUrl.pathname.startsWith('/admin')) {
        const token = request.cookies.get('token')?.value

        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url))
        }

        const payload = await verifyToken(token)
        if (!payload) {
            return NextResponse.redirect(new URL('/login', request.url))
        }

        if (payload.role !== 'ADMIN') {
            return NextResponse.redirect(new URL('/dashboard', request.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/admin/:path*'],
}
