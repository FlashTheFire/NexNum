import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Initialize next-intl middleware
const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Skip middleware for API routes and static assets
    if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.includes('.')) {
        const response = NextResponse.next();
        attachSecurityHeaders(response);
        return response;
    }

    // Handle i18n routing
    const response = intlMiddleware(request);

    // Attach Security Headers to the i18n response
    attachSecurityHeaders(response);

    return response;
}

function attachSecurityHeaders(response: NextResponse) {
    response.headers.set('X-DNS-Prefetch-Control', 'on')
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'origin-when-cross-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io https://*.vercel-insights.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https: http:",
        "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io wss: https:",
        "frame-ancestors 'self'",
        "frame-src 'self' http://localhost:3001",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ')
    response.headers.set('Content-Security-Policy', csp)

    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    response.headers.set('X-Request-ID', requestId)
    response.headers.set('X-Request-Start', Date.now().toString())
}

export const config = {
    // Matcher:
    // 1. Exclude specific paths (health, metrics, Next.js internals, statics)
    // 2. Include everything else (including API routes for monitoring)
    matcher: [
        '/((?!api/health|api/metrics|_next|static|favicon.ico|images|.*\\..*).*)',
    ]
};
