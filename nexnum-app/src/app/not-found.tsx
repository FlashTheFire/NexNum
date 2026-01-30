"use client"

// Basic 404
import "./globals.css"

// Note: This root-level not-found page cannot use next-intl hooks
// because it's outside the [locale] segment and has no i18n provider context.
// For localized 404 pages, use src/app/[locale]/not-found.tsx instead.

export default function NotFound() {
    return (
        <html lang="en">
            <body style={{ backgroundColor: '#030305', color: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', margin: 0 }}>
                <h1 style={{ fontSize: '4rem', marginBottom: '1rem' }}>404</h1>
                <p style={{ color: '#888', marginBottom: '2rem' }}>Protocol Error: Requested resource not found.</p>
                <a href="/" style={{ color: '#ccff00', textDecoration: 'none', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                    Return to Home
                </a>
            </body>
        </html>
    )
}

