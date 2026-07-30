import { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import '../globals.css'

const inter = Inter({ subsets: ['latin'] })

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.in'

export const metadata = {
    metadataBase: new URL(baseUrl),
    title: 'NexNum API v1 Documentation | Developer Hub',
    description: 'Official API reference, interactive playground, SDKs, and code examples for NexNum virtual numbers and SMS verification APIs.'
}

export default function ApiDocsLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body className={`${inter.className} min-h-screen bg-[#08080a] text-gray-100 antialiased selection:bg-[hsl(var(--neon-lime))] selection:text-black`}>
                {children}
            </body>
        </html>
    )
}
