// Instrumentation file for Sentry initialization
// This runs once when the server starts

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config')
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config')
    }
}

export const onRequestError = async (
    err: Error,
    request: Request,
    context: { routerKind: string; routePath: string }
) => {
    // This captures errors in API routes and middleware
    const Sentry = await import('@sentry/nextjs')

    Sentry.captureException(err, {
        tags: {
            routerKind: context.routerKind,
            routePath: context.routePath,
        },
        extra: {
            url: request.url,
            method: request.method,
        },
    })
}
