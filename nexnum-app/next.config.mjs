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
    // Stockholm Production Fast-Path: Resolve t3.small Resource Deadlock
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },

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
    async rewrites() {
        const socketPort = process.env.SOCKET_PORT || '3951';
        return {
            beforeFiles: [
                {
                    source: '/api/socket',
                    destination: `http://localhost:${socketPort}/api/socket`,
                },
                {
                    source: '/api/socket/:path*',
                    destination: `http://localhost:${socketPort}/api/socket/:path*`,
                },
            ],
        };
    },

    // Performance optimizations
    output: process.platform === 'win32' ? undefined : 'standalone',
    reactStrictMode: true,
    poweredByHeader: false,

    logging: {
        fetches: {
            fullUrl: false,
        },
    },

    images: {
        formats: ['image/avif', 'image/webp'],
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },

    /*
    experimental: {
        optimizePackageImports: [
            'lucide-react',
            'framer-motion',
            '@radix-ui/react-icons',
            'date-fns',
        ],
    },
    */

    /*
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                net: false,
                tls: false,
                crypto: false,
                worker_threads: false,
            };
        } else {
            // Enterprise: Shield server build from background-only native dependencies
            config.externals = [...(config.externals || []), 'worker_threads', 'tsx'];
        }

        if (config.treeshake) {
            config.treeshake.removeDebugLogging = true;
        }

        return config;
    },
    */
    turbopack: {},
};

const sentryWebpackPluginOptions = {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    hideSourceMaps: true,
    tunnelRoute: "/monitoring",
    dryRun: !process.env.SENTRY_AUTH_TOKEN,
};

let config = withNextIntl(nextConfig);
config = withBundleAnalyzer(config);

if (process.env.SENTRY_DSN) {
    config = withSentryConfig(config, sentryWebpackPluginOptions);
}

export default config;
