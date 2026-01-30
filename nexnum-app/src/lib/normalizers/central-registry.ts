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
        const canonicalName = getCanonicalName(rawName)
        const canonicalCode = generateCanonicalCode(canonicalName)

        // 1. Look up in the Central Lookup Table
        let lookup = await (prisma.serviceLookup as any).findUnique({
            where: { serviceCode: canonicalCode }
        })

        // 2. Auto-Assign if missing
        if (!lookup) {
            try {
                lookup = await (prisma.serviceLookup as any).create({
                    data: {
                        serviceCode: canonicalCode,
                        serviceName: canonicalName
                    }
                })
                logger.info(`[REGISTRY] New Service Registered: ${canonicalName} -> ID: ${lookup.serviceId}`)
            } catch (error: any) {
                // If collision on canonicalCode, just re-fetch
                if (error.code === 'P2002') {
                    lookup = await (prisma.serviceLookup as any).findUnique({
                        where: { serviceCode: canonicalCode }
                    })
                } else {
                    throw error
                }
            }
        }

        if (!lookup) throw new Error(`[REGISTRY] Failed to resolve Service ID for ${canonicalName}`)

        return {
            id: lookup.serviceId,
            name: lookup.serviceName,
            code: lookup.serviceCode
        }
    }

    /**
     * Maps a Provider Country to our Internal Country ID
     */
    static async resolveCountryId(providerName: string, externalId: string, rawName: string): Promise<{ id: number; name: string; code: string }> {
        const canonicalName = getCanonicalName(rawName)
        const canonicalCode = generateCanonicalCode(canonicalName)

        // 1. Look up in the Central Lookup Table
        let lookup = await (prisma.countryLookup as any).findUnique({
            where: { countryCode: canonicalCode }
        })

        // 2. Auto-Assign if missing
        if (!lookup) {
            try {
                lookup = await (prisma.countryLookup as any).create({
                    data: {
                        countryCode: canonicalCode,
                        countryName: canonicalName
                    }
                })
                logger.info(`[REGISTRY] New Country Registered: ${canonicalName} -> ID: ${lookup.countryId}`)
            } catch (error: any) {
                if (error.code === 'P2002') {
                    lookup = await (prisma.countryLookup as any).findUnique({
                        where: { countryCode: canonicalCode }
                    })
                } else {
                    throw error
                }
            }
        }

        if (!lookup) throw new Error(`[REGISTRY] Failed to resolve Country ID for ${canonicalName}`)

        return {
            id: lookup.countryId,
            name: lookup.countryName,
            code: lookup.countryCode
        }
    }
}
