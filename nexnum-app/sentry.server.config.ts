// Sentry Server Configuration for NexNum
import * as Sentry from "@sentry/nextjs"

Sentry.init({
    dsn: "https://e6e6efd5e81d6afcbffd3ee38c8afa28@o4510636540166144.ingest.us.sentry.io/4510636545736704",

    // Environment
    environment: process.env.NODE_ENV,

    // Enable logging
    enableLogs: true,

    // Performance Monitoring (lower rate for server)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Integrations
    integrations: [
        Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
    ],

    // Debug mode (disabled to reduce console noise)
    debug: false,

    // Spotlight for local Sentry debugging (disabled)
    spotlight: false,

    // Initial scope
    initialScope: {
        tags: {
            app: 'nexnum',
            runtime: 'server',
        },
    },
})
