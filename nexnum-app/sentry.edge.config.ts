// Sentry Edge Configuration for NexNum (Middleware)
import * as Sentry from "@sentry/nextjs"

Sentry.init({
    dsn: "https://e6e6efd5e81d6afcbffd3ee38c8afa28@o4510636540166144.ingest.us.sentry.io/4510636545736704",

    // Environment
    environment: process.env.NODE_ENV,

    // Enable logging
    enableLogs: true,

    // Lower sample rate for edge functions
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0.5,

    // Initial scope
    initialScope: {
        tags: {
            app: 'nexnum',
            runtime: 'edge',
        },
    },
})
