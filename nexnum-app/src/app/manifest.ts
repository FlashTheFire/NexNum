import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'NexNum',
        short_name: 'NexNum',
        description: 'Premium Virtual Numbers for SMS Verification',
        start_url: '/',
        id: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        background_color: '#0B0F13',
        theme_color: '#C6FF00',
        orientation: 'any',
        categories: ['utilities', 'security', 'productivity'],
        lang: 'en',
        dir: 'ltr',
        icons: [
            {
                src: '/favicon.ico',
                sizes: '32x32',
                type: 'image/x-icon',
            },
            {
                src: '/icon.svg',
                sizes: 'any',
                type: 'image/svg+xml',
            },
            {
                src: '/apple-icon.png',
                sizes: '180x180',
                type: 'image/png',
            },
        ],
    }
}
