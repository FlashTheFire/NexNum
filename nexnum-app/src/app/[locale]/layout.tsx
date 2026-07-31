import type { Metadata, Viewport } from "next";
export const dynamic = "force-dynamic";
import { Inter } from "next/font/google";
import "../globals.css";
import { Toaster } from "sonner";
import JsonLd from "@/components/seo/JsonLd";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { CurrencyProvider } from '@/providers/CurrencyProvider';
import { ThemeProvider } from '@/providers/theme-provider';
import '@/lib/core/init'; // Environment validation

const inter = Inter({ subsets: ["latin"] });

const ALL_LOCALES = ['en', 'zh', 'es', 'hi', 'ru', 'tr', 'ar', 'pt', 'fr'];

export const viewport: Viewport = {
    themeColor: '#C6FF00',
    width: 'device-width',
    initialScale: 1,
}

import { headers } from 'next/headers';
import { getTenantFromHost } from '@/lib/domain/tenant-context';

export async function generateMetadata({
    params
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const headersList = await headers();
    const host = headersList.get('x-tenant-domain') || headersList.get('host') || 'nexnum.in';
    const protocol = headersList.get('x-forwarded-proto') || 'https';
    const baseUrl = `${protocol}://${host}`;

    const tenant = getTenantFromHost(host);

    const currentLocale = ALL_LOCALES.includes(locale) ? locale : 'en';
    const canonicalUrl = `${baseUrl}/${currentLocale}`;

    const languageAlternates: Record<string, string> = {};
    for (const loc of ALL_LOCALES) {
        languageAlternates[loc] = `${baseUrl}/${loc}`;
    }
    languageAlternates['x-default'] = `${baseUrl}/en`;

    const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL
    const validBaseUrl = envSiteUrl || (host && !host.includes('localhost') ? `${protocol}://${host}` : 'https://nexnum.is')

    return {
        metadataBase: new URL(validBaseUrl),
        title: {
            default: "Buy Virtual Number for OTP in India | Instant SMS Verification | NexNum",
            template: `%s | ${tenant.brandName}`
        },
        description: "Instant virtual phone numbers for online OTP SMS verification in India. Receive activation codes securely for WhatsApp, Telegram, Google & 500+ global services. Pay per use, zero subscriptions.",
        keywords: [
            "NexNum",
            "nexnum",
            "buy virtual number india",
            "virtual number for otp verification",
            "temporary phone number india",
            "receive sms online india",
            "whatsapp virtual number india",
            "telegram otp verification",
            "disposable phone number for verification",
            "temp SMS receiver india",
            "openai chatgpt phone verification",
            "google account verification number",
            "virtual number api for developers",
            "second phone number for whatsapp",
            "private sms verification platform",
            "instant otp receiver india"
        ],
        authors: [{ name: "NexNum", url: "https://nexnum.in" }],
        creator: "NexNum",
        publisher: "NexNum",
        applicationName: "NexNum",
        generator: "Next.js",
        alternates: {
            canonical: canonicalUrl,
            languages: languageAlternates
        },
        icons: {
            icon: [
                { url: '/favicon.ico' },
                { url: '/icon.svg', type: 'image/svg+xml' }
            ],
            apple: '/apple-icon.png',
            shortcut: '/favicon.ico',
        },
        openGraph: {
            type: "website",
            locale: currentLocale === 'hi' ? 'hi_IN' : 'en_US',
            url: canonicalUrl,
            title: "Buy Virtual Number for OTP in India | Instant SMS Verification | NexNum",
            description: "Instant virtual phone numbers for online OTP SMS verification in India. Receive activation codes securely for WhatsApp, Telegram, Google & 500+ global services. Pay per use, zero subscriptions.",
            siteName: "NexNum",
            images: [
                {
                    url: `${baseUrl}/opengraph-image.png`,
                    width: 1200,
                    height: 630,
                    alt: 'NexNum - Instant Virtual Numbers & OTP Verification India',
                }
            ],
        },
        twitter: {
            card: "summary_large_image",
            title: "Buy Virtual Number for OTP in India | NexNum",
            description: "Instant virtual phone numbers for online OTP SMS verification. Private, fast & pay-per-use.",
            images: [`${baseUrl}/twitter-image.png`],
        },
        appleWebApp: {
            capable: true,
            title: 'NexNum',
            statusBarStyle: 'default',
        },
        verification: {
            google: "HIEXn4sCB_CkRLxMDAs85-O7a6w8DZMFvNW60Cior9I",
        },
        other: {
            'msapplication-TileColor': '#C6FF00',
        },
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                'max-video-preview': -1,
                'max-image-preview': 'large',
                'max-snippet': -1,
            },
        },
    };
}

export function generateStaticParams() {
    return ALL_LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
    children,
    params
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);
    const messages = await getMessages();

    return (
        <html lang={locale} className="dark" suppressHydrationWarning>
            <body className={`${inter.className} antialiased`}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem
                    disableTransitionOnChange
                >
                    <NextIntlClientProvider messages={messages}>
                        <CurrencyProvider>
                            <JsonLd />
                            {children}
                            <Toaster richColors position="top-right" />
                        </CurrencyProvider>
                    </NextIntlClientProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
