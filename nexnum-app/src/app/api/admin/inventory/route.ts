import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
    searchAdminCountries,
    searchAdminServices,
    searchRawInventory
} from '@/lib/search/search'

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const type = (searchParams.get('type') || 'countries') as 'countries' | 'services'
    const provider = searchParams.get('provider') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const q = searchParams.get('q') || ''
    const aggregate = searchParams.get('aggregate') !== 'false'
    const includeHidden = searchParams.get('includeHidden') === 'true'

    try {
        let result: { items: any[]; total: number }

        if (aggregate) {
            // Smart View (Aggregated)
            if (type === 'countries') {
                result = await searchAdminCountries(q, { page, limit, provider, includeHidden })
            } else {
                result = await searchAdminServices(q, { page, limit, provider, includeHidden })
            }

            return NextResponse.json({
                items: result.items,
                total: result.total,
                pages: Math.ceil(result.total / limit),
                mode: 'aggregated'
            })
        } else {
            // Raw View (by Provider or Global Raw)
            result = await searchRawInventory(type, q, { provider, page, limit, includeHidden })

            return NextResponse.json({
                items: result.items,
                total: result.total,
                pages: Math.ceil(result.total / limit),
                mode: 'raw'
            })
        }
    } catch (error) {
        console.error('Inventory API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch inventory from search engine' }, { status: 500 });
    }
}
