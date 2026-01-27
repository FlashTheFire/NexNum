import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Bundle analyzer configuration
const withBundleAnalyzer = bundleAnalyzer({
    enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    // CDN & Caching Optimization
    async headers() {
        return [
            {
                source: '/(.*).(png|jpg|jpeg|svg|webp|ico)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
            {
                source: '/fonts/(.*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: `
                            default-src 'self';
                            script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.hcaptcha.com https://challenges.cloudflare.com;
                            style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                            img-src 'self' data: blob: https://*.githubusercontent.com https://grizzlysms.com https://api.dicebear.com http://localhost:3961;
                            font-src 'self' data: https://fonts.gstatic.com;
                            frame-src 'self' https://js.hcaptcha.com https://challenges.cloudflare.com http://localhost:3961;
                            connect-src 'self' https://api.hcaptcha.com https://grizzlysms.com http://localhost:3961;
                            object-src 'none';
                            base-uri 'self';
                        `.replace(/\s{2,}/g, ' ').trim()
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff'
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY'
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin'
                    },
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block'
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
                    }
                ]
            }
        ]
    },

    // Proxy socket.io requests to socket server for same-origin communication
    // This fixes cross-origin cookie issues with polling transport
    async rewrites() {
        const socketPort = process.env.SOCKET_PORT || '3951';
        return {
            // beforeFiles runs BEFORE checking for pages/API routes
            // This is necessary because /api/socket would otherwise match API route handling
            beforeFiles: [
                // Match base path: /api/socket (socket.io uses query strings here)
                {
                    source: '/api/socket',
                    destination: `http://localhost:${socketPort}/api/socket`,
                },
                // Match subpaths: /api/socket/anything  
                {
                    source: '/api/socket/:path*',
                    destination: `http://localhost:${socketPort}/api/socket/:path*`,
                },
            ],
        };
    },
    // ... other config
    // Performance optimizations
    // Disable standalone on Windows to avoid EINVAL (colon in filename) errors during tracing
    output: process.platform === 'win32' ? undefined : 'standalone',
    reactStrictMode: true,
    poweredByHeader: false,

    // Suppress verbose request logging to keep terminal clean
    logging: {
        fetches: {
            fullUrl: false,
        },
    },

    // Image optimization
    images: {
        formats: ['image/avif', 'image/webp'],
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },

    // Experimental features for better performance
    experimental: {
        // Optimize package imports - auto tree-shake
        optimizePackageImports: [
            'lucide-react',
            'framer-motion',
            '@radix-ui/react-icons',
            'date-fns',
        ],
    },

    // Webpack optimizations
    webpack: (config, { isServer }) => {
        // Don't bundle server-only packages on client
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                net: false,
                tls: false,
                crypto: false,
            };
        }

        // Fix Sentry deprecation warning
        if (config.treeshake) {
            config.treeshake.removeDebugLogging = true;
        }

        return config;
    },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    hideSourceMaps: true,
    tunnelRoute: "/monitoring",

    // Don't attempt to upload source maps if we don't have a token (e.g. local dev)
    dryRun: !process.env.SENTRY_AUTH_TOKEN,
};

// Apply configurations conditionally
let config = withNextIntl(nextConfig);

// Apply bundle analyzer
config = withBundleAnalyzer(config);

// Apply Sentry (only if configured)
if (process.env.SENTRY_DSN) {
    config = withSentryConfig(config, sentryWebpackPluginOptions);
}

export default config;
