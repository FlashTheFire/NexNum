// Sentry Client Configuration for NexNum
import * as Sentry from "@sentry/nextjs"

Sentry.init({
    dsn: "https://e6e6efd5e81d6afcbffd3ee38c8afa28@o4510636540166144.ingest.us.sentry.io/4510636545736704",

    // Environment
    environment: process.env.NODE_ENV,

    // Enable logging
    enableLogs: true,

    // Performance Monitoring (10% in prod, 100% in dev)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session Replay (captures user sessions)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Integrations
    integrations: [
        // Capture console logs as Sentry logs
        Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
        Sentry.replayIntegration(),
    ],

    // Debug mode (disabled to reduce console noise)
    debug: false,

    // Ignore common non-error events
    ignoreErrors: [
        'Network Error',
        'NetworkError',
        'Failed to fetch',
        'ResizeObserver loop',
        'AbortError',
    ],

    // Tag all events
    initialScope: {
        tags: {
            app: 'nexnum',
            runtime: 'browser',
        },
    },
})
