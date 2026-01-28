import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Initialize next-intl middleware (re-using for proxy)
const intlMiddleware = createMiddleware(routing);

/**
 * Next.js 16 Proxy
 * Renamed from middleware to proxy to align with new project conventions.
 * Proxy executes early in the request lifecycle for routing, rewrites, and headers.
 */
export default async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Skip proxy for API routes and static assets
    if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.includes('.')) {
        const response = NextResponse.next();

        // High-Performance Weighting (Phase 22)
        // Instruct downstream limiters on request 'cost'
        if (pathname.includes('/getNumber') || pathname.includes('/order')) {
            response.headers.set('X-Request-Cost', '5') // Heavy
        } else {
            response.headers.set('X-Request-Cost', '1') // Light
        }

        // Static Cache Optimization for performance
        if (pathname.includes('/search/countries') || pathname.includes('/search/services')) {
            response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30')
        }

        attachSecurityHeaders(response);
        return response;
    }

    // Handle i18n routing
    const response = intlMiddleware(request);

    // AUTH ENFORCEMENT (Edge-side)
    if (pathname.includes('/dashboard')) {
        const token = request.cookies.get('token')?.value;

        if (!token) {
            // Not logged in -> Redirect to login (preserving locale if possible)
            return NextResponse.redirect(new URL('/login', request.url));
        }

        try {
            // Light-weight JWT verification at the Edge
            const { jwtVerify } = await import('jose');
            const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-only-not-for-production');
            const { payload } = await jwtVerify(token, secret);

            const user = payload as any;

            // Block unverified users from dashboard
            if (!user.emailVerified) {
                return NextResponse.redirect(new URL('/auth/pending-verification', request.url));
            }
        } catch (error) {
            // Invalid token -> Redirect to login
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // Attach Security Headers to the i18n response
    attachSecurityHeaders(response);

    return response;
}

function attachSecurityHeaders(response: NextResponse) {
    response.headers.set('X-DNS-Prefetch-Control', 'on')
    const IS_SECURE = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') || false
    if (IS_SECURE) {
        response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    }
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'origin-when-cross-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.hcaptcha.com https://challenges.cloudflare.com https://*.sentry.io https://*.vercel-insights.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://*.githubusercontent.com https://grizzlysms.com https://api.dicebear.com http://localhost:3951 https:",
        "connect-src 'self' https://api.hcaptcha.com https://grizzlysms.com http://localhost:3951 https://*.sentry.io https://*.ingest.sentry.io wss: https:",
        "frame-src 'self' https://js.hcaptcha.com https://challenges.cloudflare.com http://localhost:3951",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; ')
    response.headers.set('Content-Security-Policy', csp)

    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    const traceId = response.headers.get('X-Trace-ID') || requestId

    response.headers.set('X-Request-ID', requestId)
    response.headers.set('X-Trace-ID', traceId)
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
