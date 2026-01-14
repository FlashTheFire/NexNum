import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

// Bundle analyzer configuration
const withBundleAnalyzer = bundleAnalyzer({
    enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Performance optimizations
    // output: 'standalone',
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
let config = nextConfig;

// Apply bundle analyzer
config = withBundleAnalyzer(config);

// Apply Sentry (only if configured)
if (process.env.SENTRY_DSN) {
    config = withSentryConfig(config, sentryWebpackPluginOptions);
}

export default config;
