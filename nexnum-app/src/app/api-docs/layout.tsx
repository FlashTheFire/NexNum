import { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import '../globals.css'

const inter = Inter({ subsets: ['latin'] })

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.in'

export const metadata = {
    metadataBase: new URL(baseUrl),
    title: 'NexNum API Documentation',
    description: 'Interactive API documentation for NexNum Public API v1'
}

export default function ApiDocsLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body className={`${inter.className} min-h-screen bg-gray-900 antialiased`}>
                {children}
            </body>
        </html>
    )
}
