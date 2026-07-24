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

export async function generateMetadata({
    params
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nx1.in';

    const currentLocale = ALL_LOCALES.includes(locale) ? locale : 'en';
    const canonicalUrl = `${baseUrl}/${currentLocale}`;

    const languageAlternates: Record<string, string> = {};
    for (const loc of ALL_LOCALES) {
        languageAlternates[loc] = `${baseUrl}/${loc}`;
    }
    languageAlternates['x-default'] = `${baseUrl}/en`;

    return {
        metadataBase: new URL(baseUrl),
        title: {
            default: "NexNum – Virtual Phone Numbers for SMS Verification",
            template: "%s | NexNum"
        },
        description: "NexNum is the premier platform for instant virtual phone numbers, temporary SMS verifications, and online numbers for WhatsApp, Telegram, Google, Discord, TikTok, Instagram, OpenAI and 500+ services with instant OTP delivery.",
        keywords: [
            "NexNum",
            "nexnum",
            "virtual phone number",
            "temporary phone number",
            "receive sms online",
            "sms verification",
            "otp verification",
            "buy virtual number",
            "online sms",
            "whatsapp verification",
            "telegram verification",
            "discord verification",
            "google verification",
            "tiktok verification",
            "instagram verification",
            "openai verification"
        ],
        authors: [{ name: "NexNum", url: "https://nx1.in" }],
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
            title: "NexNum – Virtual Phone Numbers for SMS Verification",
            description: "NexNum provides instant virtual phone numbers for online SMS verification worldwide.",
            siteName: "NexNum",
            images: [
                {
                    url: `${baseUrl}/opengraph-image.png`,
                    width: 1200,
                    height: 630,
                    alt: 'NexNum - Secure SMS Verification',
                }
            ],
        },
        twitter: {
            card: "summary_large_image",
            title: "NexNum – Virtual Phone Numbers",
            description: "Instant SMS Verification & Virtual Numbers Worldwide",
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
