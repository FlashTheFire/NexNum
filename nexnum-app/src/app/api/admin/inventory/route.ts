import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/requireAdmin'
import { normalizeCountryName, aggregateCountries, AggregatedCountry } from '@/lib/country-normalizer';
import { aggregateServices, AggregatedService } from '@/lib/service-normalizer';

// Simple In-Memory Cache
const CACHE_TTL = 60 * 1000; // 60 seconds
let countriesCache: { data: AggregatedCountry[], timestamp: number } | null = null;
let servicesCache: { data: AggregatedService[], timestamp: number } | null = null;

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'countries'
    const provider = searchParams.get('provider') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit
    const search = searchParams.get('q') || ''
    const aggregate = searchParams.get('aggregate') !== 'false'

    try {
        if (type === 'countries') {
            if (aggregate && !provider) {
                // Check Cache
                const now = Date.now();
                let aggregated: AggregatedCountry[];

                if (countriesCache && (now - countriesCache.timestamp < CACHE_TTL)) {
                    aggregated = countriesCache.data;
                } else {
                    // Cache Miss: Fetch & Aggregate
                    const allCountries = await prisma.country.findMany({
                        where: { isActive: true },
                        orderBy: { name: 'asc' },
                        select: {
                            id: true,
                            externalId: true,
                            name: true,
                            phoneCode: true,
                            provider: true,
                            lastSyncedAt: true
                        }
                    });

                    aggregated = aggregateCountries(allCountries.map(c => ({
                        name: c.name,
                        phoneCode: c.phoneCode || '',
                        provider: c.provider,
                        externalId: c.externalId,
                        lastSyncedAt: c.lastSyncedAt || new Date()
                    })));

                    countriesCache = { data: aggregated, timestamp: now };
                }

                // Filter from Memory
                let filtered = aggregated;
                if (search) {
                    const searchLower = search.toLowerCase();
                    filtered = aggregated.filter(c =>
                        c.canonicalName.toLowerCase().includes(searchLower) ||
                        c.displayName.toLowerCase().includes(searchLower) ||
                        c.phoneCode.includes(search) ||
                        c.rawNames.some(n => n.toLowerCase().includes(searchLower))
                    );
                }

                const total = filtered.length;
                const pages = Math.ceil(total / limit);
                const items = filtered.slice(skip, skip + limit);

                return NextResponse.json({
                    items,
                    total,
                    pages,
                    mode: 'aggregated'
                });
            }

            // Regular non-aggregated view
            const where = {
                isActive: true,
                ...(provider && { provider }),
                ...(search && {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' as const } },
                        { phoneCode: { contains: search, mode: 'insensitive' as const } }
                    ]
                })
            };

            const items = await prisma.country.findMany({
                where,
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
                take: limit,
                skip,
                select: {
                    id: true,
                    externalId: true,
                    name: true,
                    slug: true,
                    phoneCode: true,
                    iconUrl: true,
                    provider: true,
                    lastSyncedAt: true
                }
            });

            const total = await prisma.country.count({ where });

            return NextResponse.json({
                items,
                total,
                pages: Math.ceil(total / limit),
                mode: 'raw'
            });
        } else {
            // SERVICES
            if (aggregate && !provider) {
                const now = Date.now();
                let aggregated: AggregatedService[];

                if (servicesCache && (now - servicesCache.timestamp < CACHE_TTL)) {
                    aggregated = servicesCache.data;
                } else {
                    const allServices = await prisma.service.findMany({
                        where: { isActive: true },
                        include: {
                            pricing: {
                                where: { isAvailable: true },
                                select: { price: true, originalPrice: true }
                            }
                        },
                        orderBy: { name: 'asc' }
                    });

                    aggregated = aggregateServices(allServices.map(s => {
                        const minPrice = s.pricing.length > 0
                            ? Math.min(...s.pricing.map(p => Number(p.price)))
                            : 0;

                        return {
                            name: s.name,
                            code: s.shortName || s.slug,
                            provider: s.provider,
                            externalId: s.externalId,
                            price: minPrice,
                            count: s.pricing.length,
                            isActive: s.isActive
                        }
                    }));

                    servicesCache = { data: aggregated, timestamp: now };
                }

                let filtered = aggregated;
                if (search) {
                    const searchLower = search.toLowerCase();
                    filtered = aggregated.filter(s =>
                        s.canonicalName.toLowerCase().includes(searchLower) ||
                        Array.from(s.codes).some(c => c.toLowerCase().includes(searchLower)) ||
                        s.providers.some(p => p.name.toLowerCase().includes(searchLower))
                    );
                }

                const total = filtered.length;
                const items = filtered.slice(skip, skip + limit);
                const serializedItems = items.map(item => ({
                    ...item,
                    codes: Array.from(item.codes)
                }));

                return NextResponse.json({
                    items: serializedItems,
                    total,
                    pages: Math.ceil(total / limit),
                    mode: 'aggregated'
                });
            }

            // Raw Services
            const where = {
                isActive: true,
                ...(provider && { provider }),
                ...(search && {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' as const } },
                        { shortName: { contains: search, mode: 'insensitive' as const } }
                    ]
                })
            };

            const items = await prisma.service.findMany({
                where,
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
                take: limit,
                skip,
                select: {
                    id: true,
                    externalId: true,
                    name: true,
                    slug: true,
                    shortName: true,
                    iconUrl: true,
                    senderTitle: true,
                    smsPattern: true,
                    provider: true,
                    lastSyncedAt: true,
                    _count: {
                        select: { pricing: true }
                    }
                }
            });

            const total = await prisma.service.count({ where });

            return NextResponse.json({
                items,
                total,
                pages: Math.ceil(total / limit),
                mode: 'raw'
            });
        }
    } catch (error) {
        console.error('Inventory API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
    }
}
