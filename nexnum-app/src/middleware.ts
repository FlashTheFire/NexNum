import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
    // Match only internationalized pathnames
    matcher: [
        // Match root path
        '/',
        // Match all pathnames within supported locales
        '/(en|zh|es|hi|ru|tr|ar|pt|fr)/:path*',
        // Match all paths except api, _next, static files
        '/((?!api|_next|_sentry|.*\\..*).*)'
    ]
};
