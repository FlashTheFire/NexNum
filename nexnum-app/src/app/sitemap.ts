import { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'

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
    const countries = await prisma.country.findMany({
        where: { isActive: true },
        select: { slug: true, lastSyncedAt: true },
    })

    const countryRoutes = countries.map((country) => ({
        url: `${baseUrl}/sms/${country.slug}`,
        lastModified: country.lastSyncedAt || new Date(),
        changeFrequency: 'hourly' as const,
        priority: 0.8,
    }))

    // 3. Dynamic Services
    const services = await prisma.service.findMany({
        where: { isActive: true },
        select: { slug: true, lastSyncedAt: true },
    })

    const serviceRoutes = services.map((service) => ({
        url: `${baseUrl}/sms/service/${service.slug}`,
        lastModified: service.lastSyncedAt || new Date(),
        changeFrequency: 'hourly' as const,
        priority: 0.7,
    }))

    return [...staticRoutes, ...countryRoutes, ...serviceRoutes]
}
