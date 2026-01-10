import { MetadataRoute } from 'next'
import { searchAdminCountries, searchAdminServices } from '@/lib/search/search'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.com'

    // 1. Static Routes
    const staticRoutes = [
        '',
        '/login',
        '/signup',
        '/pricing',
        '/terms',
        '/privacy',
        '/blog',
        '/api-docs',
    ].map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: 1.0,
    }))

    // 2. Dynamic Countries
    const countryResult = await searchAdminCountries('', { limit: 1000 })
    const countryRoutes = countryResult.items
        .filter((c: any) => c.code)
        .map((country: any) => ({
            url: `${baseUrl}/sms/${country.code.toLowerCase()}`,
            lastModified: new Date(country.lastSyncedAt),
            changeFrequency: 'hourly' as const,
            priority: 0.8,
        }))

    // 3. Dynamic Services
    const serviceResult = await searchAdminServices('', { limit: 1000 })
    const serviceRoutes = serviceResult.items.map((service: any) => ({
        url: `${baseUrl}/sms/service/${service.canonicalSlug}`,
        lastModified: new Date(),
        changeFrequency: 'hourly' as const,
        priority: 0.7,
    }))

    return [...staticRoutes, ...countryRoutes, ...serviceRoutes]
}
