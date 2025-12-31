import { MeiliSearch } from 'meilisearch'

// Meilisearch client
export const meili = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY || 'dev_master_key',
})

// Index names
export const INDEXES = {
    NUMBERS: 'numbers',
}

// Initialize indexes (call once on app start)
export async function initSearchIndexes() {
    try {
        // Create numbers index if not exists
        const numbersIndex = meili.index(INDEXES.NUMBERS)

        // Update settings
        await numbersIndex.updateSettings({
            searchableAttributes: ['phoneNumber', 'countryName', 'serviceName'],
            filterableAttributes: ['countryCode', 'serviceCode', 'status', 'ownerId'],
            sortableAttributes: ['price', 'createdAt'],
        })

        console.log('Search indexes initialized')
    } catch (error) {
        console.error('Failed to initialize search indexes:', error)
        // Don't crash the app if Meilisearch is not available
    }
}

// Index a number for search
export async function indexNumber(number: {
    id: string
    phoneNumber: string
    countryCode: string
    countryName?: string
    serviceName?: string
    serviceCode?: string
    price: number
    status: string
    ownerId?: string
    createdAt: Date
}) {
    try {
        const index = meili.index(INDEXES.NUMBERS)
        await index.addDocuments([number], { primaryKey: 'id' })
    } catch (error) {
        console.error('Failed to index number:', error)
    }
}

// Search numbers
export async function searchNumbers(
    query: string,
    filters?: {
        countryCode?: string
        serviceCode?: string
        status?: string
        ownerId?: string
    },
    options?: {
        page?: number
        limit?: number
        sort?: string[]
    }
) {
    try {
        const index = meili.index(INDEXES.NUMBERS)

        const filterParts: string[] = []
        if (filters?.countryCode) filterParts.push(`countryCode = "${filters.countryCode}"`)
        if (filters?.serviceCode) filterParts.push(`serviceCode = "${filters.serviceCode}"`)
        if (filters?.status) filterParts.push(`status = "${filters.status}"`)
        if (filters?.ownerId) filterParts.push(`ownerId = "${filters.ownerId}"`)

        const result = await index.search(query, {
            filter: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
            offset: ((options?.page || 1) - 1) * (options?.limit || 20),
            limit: options?.limit || 20,
            sort: options?.sort,
        })

        return {
            hits: result.hits,
            total: result.estimatedTotalHits,
        }
    } catch (error) {
        console.error('Search failed:', error)
        return { hits: [], total: 0 }
    }
}
