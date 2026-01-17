import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;

    // Ensure that a valid locale is used
    if (!locale || !routing.locales.includes(locale as any)) {
        locale = routing.defaultLocale;
    }

    try {
        const messages = (await import(`../../messages/${locale}.json`)).default;
        return {
            locale,
            messages
        };
    } catch (error) {
        console.error('Failed to load messages for locale:', locale, error);
        // Fallback to empty messages to prevent crash
        return {
            locale,
            messages: {}
        };
    }
});
