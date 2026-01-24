import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: 1,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: process.env.NODE_ENV === 'development',

    // Scrub sensitive data from events
    beforeSend(event) {
        if (event.request?.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
        }

        // Scrub potential secrets/keys from message/exception
        if (event.exception?.values) {
            event.exception.values.forEach(exception => {
                if (exception.value) {
                    // Simple example patterns - tighten in production
                    exception.value = exception.value.replace(/(key|secret|token|password)=[^&\s]+/gi, '$1=[REDACTED]');
                }
            });
        }

        return event;
    },
});
