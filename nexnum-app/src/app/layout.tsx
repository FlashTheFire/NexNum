import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import JsonLd from "@/components/seo/JsonLd";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
    themeColor: '#0f172a',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.com'),
    title: {
        default: "NexNum - Premium Virtual Numbers for SMS Verification",
        template: "%s | NexNum"
    },
    description: "Instant access to premium virtual phone numbers for OTP verification. Compatible with WhatsApp, Telegram, Google, and 500+ services. Global coverage, best prices.",
    keywords: ["virtual number", "sms verification", "otp bypass", "temp number", "online sim", "receive sms", "fake number", "whatsapp verification"],
    authors: [{ name: "NexNum Team" }],
    creator: "NexNum",
    publisher: "NexNum Inc.",
    icons: {
        icon: '/favicon.ico',
        shortcut: '/favicon-16x16.png',
        apple: '/apple-touch-icon.png',
    },
    manifest: '/site.webmanifest',
    openGraph: {
        type: "website",
        locale: "en_US",
        url: 'https://nexnum.com',
        title: "NexNum - #1 Premium SMS Verification Service",
        description: "Get instant SMS codes for any service. 100% success rate guarantee or free. Join 50k+ users.",
        siteName: "NexNum",
        images: [
            {
                url: '/og-image.jpg',
                width: 1200,
                height: 630,
                alt: 'NexNum Premium Dashboard',
            }
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "NexNum - Instant Virtual Numbers",
        description: "Need an OTP? Get a premium virtual number in seconds. Works for WhatsApp, Telegram, OpenAI & more.",
        images: ['/og-image.jpg'],
        creator: "@NexNumApp",
    },
    appleWebApp: {
        capable: true,
        title: 'NexNum',
        statusBarStyle: 'black-translucent',
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

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body className={inter.className}>
                <JsonLd />
                {children}
                <Toaster />
            </body>
        </html>
    );
}
