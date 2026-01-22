import { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import '../globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
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
