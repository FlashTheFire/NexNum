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

    // ──────────────────────────────────────────────────
    // MULTI-DOMAIN TENANT RESOLUTION & CANONICAL 301 REDIRECT
    // ──────────────────────────────────────────────────
    const rawHost = request.headers.get('host') || 'nexnum.in'
    const cleanHost = rawHost.split(':')[0].toLowerCase()
    const protocol = request.nextUrl.protocol || 'https:'

    // Primary Brand Domain
    const PRIMARY_DOMAIN = 'nexnum.in'

    // Non-primary domains that should 301 redirect to primary domain (preserving path and query)
    const REDIRECT_DOMAINS = [
        'nx1.in', 'www.nx1.in',
        'nextnum.in', 'www.nextnum.in',
        'nexn.in', 'www.nexn.in',
        'nextnumber.in', 'www.nextnumber.in',
        'www.nexnum.in'
    ]

    // Internal / Infrastructure hosts that MUST NOT be redirected (prevents Docker/Coolify loops)
    const isInternalHost = 
        cleanHost === 'localhost' ||
        cleanHost === '127.0.0.1' ||
        cleanHost.startsWith('socket.') ||
        cleanHost.endsWith('.sslip.io') ||
        cleanHost.endsWith('.internal') ||
        cleanHost === 'nexnum-app' ||
        cleanHost === 'nexnum-socket'

    // 301 Permanent Redirect to primary domain for brand consolidation & SEO link juice transfer
    if (!isInternalHost && REDIRECT_DOMAINS.includes(cleanHost)) {
        const targetUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${PRIMARY_DOMAIN}`)
        const redirectResponse = NextResponse.redirect(targetUrl, 301)
        
        // Preserve proxy headers
        redirectResponse.headers.set('X-Forwarded-Host', cleanHost)
        redirectResponse.headers.set('X-Forwarded-Proto', protocol.replace(':', ''))
        return redirectResponse
    }

    request.headers.set('x-tenant-domain', cleanHost)
    request.headers.set('x-tenant-url', `${protocol}//${cleanHost}`)

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

    // ──────────────────────────────────────────────────
    // AUTO-REDIRECT: Already-logged-in users → /dashboard
    // Applies to landing (/), /login, /register pages
    // ──────────────────────────────────────────────────
    const cleanPath = pathname.replace(/^\/(en|zh|es|hi|ru|tr|ar|pt|fr)/, '') || '/';
    const GUEST_ONLY_ROUTES = ['/', '/login', '/register'];

    if (GUEST_ONLY_ROUTES.includes(cleanPath)) {
        const token = request.cookies.get('token')?.value;

        if (token) {
            try {
                const { jwtVerify } = await import('jose');
                const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-only-not-for-production');
                await jwtVerify(token, secret);
                // Valid token → user is already logged in, send to dashboard
                return NextResponse.redirect(new URL('/dashboard', request.url));
            } catch {
                // Invalid/expired token → let them stay on guest page (they'll need to login)
            }
        }
    }

    // AUTH ENFORCEMENT (Edge-side) — protect /dashboard from unauthenticated users
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
                return NextResponse.redirect(new URL('/auth/verify', request.url));
            }
        } catch (error) {
            // Invalid token -> Redirect to login
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // Attach Security Headers to the i18n response
    attachSecurityHeaders(response);

    // Attach multi-domain tenant header to response
    response.headers.set('x-tenant-domain', cleanHost);

    return response;
}

function attachSecurityHeaders(response: NextResponse) {
    response.headers.set('X-DNS-Prefetch-Control', 'on')
    const IS_PROD = process.env.NODE_ENV === 'production'
    if (IS_PROD) {
        response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    }
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'origin-when-cross-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

    // Resolve socket origin from env so CSP stays accurate in dev vs prod
    const rawSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3951'

    // HTTP(S) origin for connect-src
    const SOCKET_HTTP = rawSocketUrl
        .replace(/^wss:\/\//, 'https://')
        .replace(/^ws:\/\//, 'http://')
        .replace(/\/+$/, '')

    // WS(S) origin — derive from socket URL for explicit allowlist entry
    const SOCKET_WS = rawSocketUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://')
        .replace(/\/+$/, '')

    const csp = [
        "default-src 'self'",
        // upgrade-insecure-requests is ONLY safe in production (where TLS exists).
        // In development (localhost:3000, no cert) it causes ERR_SSL_PROTOCOL_ERROR on
        // every prefetch because the browser tries to upgrade http://localhost to https://.
        ...(IS_PROD ? ["upgrade-insecure-requests"] : []),
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://js.hcaptcha.com https://challenges.cloudflare.com https://*.sentry.io https://*.vercel-insights.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        `img-src 'self' data: blob: https://*.githubusercontent.com https://api.dicebear.com https:`,
        // Must include BOTH the http(s) origin AND the ws(s) origin explicitly.
        // wss: alone doesn't cover ws:// (used on localhost without TLS).
        `connect-src 'self' ${SOCKET_HTTP} ${SOCKET_WS} https://api.hcaptcha.com https://*.sentry.io https://*.ingest.sentry.io wss: ws: https:`,
        "frame-src 'self' https://js.hcaptcha.com https://challenges.cloudflare.com",
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
