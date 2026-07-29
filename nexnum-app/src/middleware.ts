import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import proxy from './proxy'

/**
 * Next.js Middleware Entrypoint
 * Handles Multi-Domain Tenant Resolution (Super CEO Multi-Domain Architecture)
 * and delegates to Proxy routing.
 */
export async function middleware(request: NextRequest) {
    const host = request.headers.get('host') || 'nx1.in'
    const protocol = request.nextUrl.protocol || 'https:'

    // Clone request headers to inject tenant metadata
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-tenant-domain', host)
    requestHeaders.set('x-tenant-url', `${protocol}//${host}`)

    // Delegate to proxy middleware
    const response = await proxy(request)

    // Append dynamic multi-domain tenant headers to response
    response.headers.set('x-tenant-domain', host)
    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
}
