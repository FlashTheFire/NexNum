import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nx1.in'
    const locales = ['en', 'zh', 'es', 'hi', 'ru', 'tr', 'ar', 'pt', 'fr']
    const publicPaths = [
        '',
        '/about',
        '/contact',
        '/coverage',
        '/legal',
        '/privacy',
        '/terms',
        '/login',
        '/register',
        '/services'
    ]

    const routes: MetadataRoute.Sitemap = []

    // 1. Root & Localized Base Pages (e.g. https://nx1.in/en/about)
    for (const locale of locales) {
        for (const path of publicPaths) {
            routes.push({
                url: `${baseUrl}/${locale}${path}`,
                lastModified: new Date(),
                changeFrequency: path === '' ? 'hourly' : 'weekly',
                priority: path === '' ? 1.0 : 0.8,
            })
        }
    }

    return routes
}
