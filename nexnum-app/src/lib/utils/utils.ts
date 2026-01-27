import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatPrice(price: number, options: {
    currency?: string,
    locale?: string
} = {}) {
    const { currency = 'USD', locale = 'en-US' } = options;

    // Input is in main units (e.g. 1.50 for $1.50)
    const displayValue = price;

    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currency,
        }).format(displayValue)
    } catch (e) {
        // Fallback for invalid currency/locale
        return `${currency} ${displayValue.toFixed(2)}`;
    }
}

/**
 * Standardized Relative Time Formatting
 * Uses Intl.RelativeTimeFormat for professional, localized duration strings.
 */
export function formatRelativeTime(date: Date | string, locale: string = 'en-US') {
    if (!date) return ""
    const d = new Date(date)
    const now = new Date()
    const diffInSeconds = Math.floor((d.getTime() - now.getTime()) / 1000)

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (Math.abs(diffInSeconds) < 60) return rtf.format(diffInSeconds, 'second');

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (Math.abs(diffInMinutes) < 60) return rtf.format(diffInMinutes, 'minute');

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (Math.abs(diffInHours) < 24) return rtf.format(diffInHours, 'hour');

    const diffInDays = Math.floor(diffInHours / 24);
    if (Math.abs(diffInDays) < 7) return rtf.format(diffInDays, 'day');

    return d.toLocaleDateString(locale);
}

export function formatDate(date: Date | string) {
    if (!date) return ""
    return new Date(date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    })
}

export function isValidImageUrl(url?: string | null): boolean {
    if (!url) return false
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')
}
