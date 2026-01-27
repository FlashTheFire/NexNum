import { prisma } from '@/lib/core/db'
import { getCanonicalName, generateCanonicalCode } from './service-identity'
import { logger } from '@/lib/core/logger'

/**
 * Central Registry Service
 * 
 * This service is responsible for mapping fragmented data from multiple 
 * providers (retrieved via getCountries/getServices) to our internal 
 * centralized Integer identity system.
 */
export class CentralRegistry {
    /**
     * Maps a Provider Service to our Internal Service ID
     */
    static async resolveServiceId(providerName: string, externalId: string, rawName: string): Promise<{ id: number; name: string; code: string }> {
        // 1. Get the clean identity (e.g., "wa" -> "WhatsApp")
        const canonicalName = getCanonicalName(rawName)
        const canonicalCode = generateCanonicalCode(canonicalName)

        // 2. Look up in the Central Lookup Table
        let lookup = await (prisma.serviceLookup as any).findUnique({
            where: { serviceCode: canonicalCode }
        })

        // 3. If missing, Auto-Assign Next ID (Management)
        if (!lookup) {
            // Get highest current ID to increment
            const lastId = await (prisma.serviceLookup as any).findFirst({
                orderBy: { id: 'desc' }
            })
            const nextId = (lastId?.id || 0) + 1

            lookup = await (prisma.serviceLookup as any).create({
                data: {
                    id: nextId,
                    serviceCode: canonicalCode,
                    name: canonicalName
                }
            })

            logger.info(`[REGISTRY] New Service Registered: ${canonicalName} -> ID: ${nextId}`)
        }

        return {
            id: lookup.id,
            name: lookup.name,
            code: lookup.serviceCode
        }
    }

    /**
     * Maps a Provider Country to our Internal Country ID
     */
    static async resolveCountryId(providerName: string, externalId: string, rawName: string): Promise<{ id: number; name: string; code: string }> {
        // 1. Standardize Country Name
        const canonicalName = getCanonicalName(rawName)
        const canonicalCode = generateCanonicalCode(canonicalName)

        // 2. Look up in the Central Lookup Table
        let lookup = await (prisma.countryLookup as any).findUnique({
            where: { countryCode: canonicalCode }
        })

        // 3. Auto-Assign if missing
        if (!lookup) {
            const lastId = await (prisma.countryLookup as any).findFirst({
                orderBy: { id: 'desc' }
            })
            const nextId = (lastId?.id === undefined || lastId.id === null) ? 1 : (lastId.id + 1)

            lookup = await (prisma.countryLookup as any).create({
                data: {
                    id: nextId,
                    countryCode: canonicalCode,
                    name: canonicalName
                }
            })

            logger.info(`[REGISTRY] New Country Registered: ${canonicalName} -> ID: ${nextId}`)
        }

        return {
            id: lookup.id,
            name: lookup.name,
            code: lookup.countryCode
        }
    }
}
