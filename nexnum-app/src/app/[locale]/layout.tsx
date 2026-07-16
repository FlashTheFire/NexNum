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

export const viewport: Viewport = {
    themeColor: '#C6FF00',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://nx1.in'),
    title: {
        default: "NexNum | Premium Virtual Numbers for SMS Verification",
        template: "%s | NexNum"
    },
    description: "Buy premium virtual phone numbers for SMS verification on WhatsApp, Telegram, Google, Discord, TikTok, Instagram, OpenAI and 500+ services with instant OTP delivery, competitive pricing, and global coverage.",
    keywords: [
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
        "openai verification",
        "virtual sim",
        "phone verification"
    ],
    authors: { name: "NexNum" },
    creator: "NexNum",
    publisher: "NexNum",
    applicationName: "NexNum",
    generator: "Next.js",
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
        locale: "en_US",
        url: "https://nx1.in",
        title: "NexNum",
        description: "Premium Virtual Numbers for SMS Verification",
        siteName: "NexNum",
        images: [
            {
                url: 'https://nx1.in/opengraph-image.png',
                width: 1200,
                height: 630,
                alt: 'NexNum - Secure SMS Verification',
            }
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "NexNum",
        description: "Premium Virtual Numbers",
        images: ['https://nx1.in/twitter-image.png'],
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
    alternates: {
        canonical: 'https://nx1.in',
    }
};

export function generateStaticParams() {
    return ['en', 'zh', 'es', 'hi', 'ru', 'tr', 'ar', 'pt', 'fr'].map((locale) => ({ locale }));
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
