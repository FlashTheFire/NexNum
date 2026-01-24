/**
 * Admin Inventory Manager
 * 
 * Centralized module for managing countries and services across
 * Prisma database and MeiliSearch index.
 * 
 * Features:
 * - Hide/Unhide countries and services
 * - Delete countries and services (soft-delete by default)
 * - Edit country/service metadata
 * - Sync changes to MeiliSearch
 */

import { prisma } from '@/lib/core/db'
import { indexOffers, deleteOffersByProvider, OfferDocument, INDEXES } from '@/lib/search/search'
import { logAdminAction } from '@/lib/core/auditLog'


// ============================================
// TYPES
// ============================================

export interface InventoryActionResult {
    success: boolean
    message: string
    affectedCount?: number
    error?: string
}

export interface CountryUpdateData {
    name?: string
    flagUrl?: string | null
}

export interface ServiceUpdateData {
    name?: string
    iconUrl?: string | null
}

// ============================================
// COUNTRY OPERATIONS
// ============================================

/**
 * Toggle country visibility (hide/unhide)
 * Hidden countries won't appear in user-facing searches
 */
export async function toggleCountryVisibility(
    providerId: string,
    externalId: string,
    isActive: boolean,
    adminId?: string
): Promise<InventoryActionResult> {
    try {
        console.log(`[toggleCountryVisibility] Lookup: providerId=${providerId}, externalId=${externalId}`)

        const country = await prisma.providerCountry.findFirst({
            where: { providerId, externalId }
        })

        if (!country) {
            // Debug: try finding just by externalId or providerId to see if we have partial match
            const countByProvider = await prisma.providerCountry.count({ where: { providerId } })
            const countByExternal = await prisma.providerCountry.count({ where: { externalId } })
            console.log(`[toggleCountryVisibility] Country not found. Stats: Provider has ${countByProvider}, ExternalId found ${countByExternal} times.`)

            // FALLBACK: Check if it's actually a Service (fixing frontend/Meili type confusion)
            const service = await prisma.providerService.findFirst({
                where: { providerId, externalId }
            })

            if (service) {
                console.log(`[toggleCountryVisibility] Found SERVICE with this ID. Redirecting to toggleServiceVisibility...`)
                return toggleServiceVisibility(providerId, externalId, isActive, adminId)
            }

            return { success: false, message: 'Country not found', error: 'NOT_FOUND' }
        }

        await prisma.providerCountry.update({
            where: { id: country.id },
            data: { isActive }
        })

        // Sync to MeiliSearch
        await syncProviderToMeiliSearch(providerId)

        // Audit log
        if (adminId) {
            await logAdminAction({
                userId: adminId,
                action: isActive ? 'UNHIDE_COUNTRY' : 'HIDE_COUNTRY',
                resourceType: 'ProviderCountry',
                resourceId: country.id,
                metadata: { providerId, externalId, name: country.name }
            })
        }

        return {
            success: true,
            message: `Country ${isActive ? 'unhidden' : 'hidden'} successfully`,
            affectedCount: 1
        }
    } catch (error: any) {
        console.error('toggleCountryVisibility error:', error)
        return { success: false, message: 'Failed to toggle visibility', error: error.message }
    }
}

/**
 * Delete a country and cascade to pricing data
 * By default uses soft-delete (marks as inactive + deletes pricing)
 */
export async function deleteCountry(
    providerId: string,
    externalId: string,
    permanent: boolean = false,
    adminId?: string
): Promise<InventoryActionResult> {
    try {
        const country = await prisma.providerCountry.findFirst({
            where: { providerId, externalId },
            include: { _count: { select: { pricing: true } } }
        })

        if (!country) {
            // Fallback to service
            const service = await prisma.providerService.findFirst({ where: { providerId, externalId } })
            if (service) {
                console.log(`[deleteCountry] Redirecting to deleteService for ${externalId}`)
                return deleteService(providerId, externalId, permanent, adminId)
            }
            return { success: false, message: 'Country not found', error: 'NOT_FOUND' }
        }

        const pricingCount = country._count.pricing

        if (permanent) {
            // Hard delete - cascades due to onDelete: Cascade
            await prisma.providerCountry.delete({
                where: { id: country.id }
            })
        } else {
            // Soft delete - mark pricing as deleted and hide country
            await prisma.$transaction([
                prisma.providerPricing.updateMany({
                    where: { countryId: country.id },
                    data: { deleted: true }
                }),
                prisma.providerCountry.update({
                    where: { id: country.id },
                    data: { isActive: false }
                })
            ])
        }

        // Sync to MeiliSearch
        await syncProviderToMeiliSearch(providerId)

        // Audit log
        if (adminId) {
            await logAdminAction({
                userId: adminId,
                action: permanent ? 'DELETE_COUNTRY_PERMANENT' : 'DELETE_COUNTRY',
                resourceType: 'ProviderCountry',
                resourceId: country.id,
                metadata: { providerId, externalId, name: country.name, pricingDeleted: pricingCount }
            })
        }

        return {
            success: true,
            message: `Country deleted${permanent ? ' permanently' : ''} (${pricingCount} pricing entries affected)`,
            affectedCount: pricingCount + 1
        }
    } catch (error: any) {
        console.error('deleteCountry error:', error)
        return { success: false, message: 'Failed to delete country', error: error.message }
    }
}

/**
 * Update country metadata (name, flagUrl)
 */
export async function updateCountry(
    providerId: string,
    externalId: string,
    updates: CountryUpdateData,
    adminId?: string
): Promise<InventoryActionResult> {
    try {
        const country = await prisma.providerCountry.findFirst({
            where: { providerId, externalId }
        })

        if (!country) {
            // Fallback to service
            const service = await prisma.providerService.findFirst({ where: { providerId, externalId } })
            if (service) {
                console.log(`[updateCountry] Redirecting to updateService for ${externalId}`)
                const serviceUpdates: ServiceUpdateData = {
                    name: updates.name,
                    iconUrl: updates.flagUrl
                }
                return updateService(providerId, externalId, serviceUpdates, adminId)
            }
            return { success: false, message: 'Country not found', error: 'NOT_FOUND' }
        }

        await prisma.providerCountry.update({
            where: { id: country.id },
            data: updates
        })

        // Sync to MeiliSearch
        await syncProviderToMeiliSearch(providerId)

        // Audit log
        if (adminId) {
            await logAdminAction({
                userId: adminId,
                action: 'UPDATE_COUNTRY',
                resourceType: 'ProviderCountry',
                resourceId: country.id,
                metadata: { providerId, externalId, updates }
            })
        }

        return { success: true, message: 'Country updated successfully', affectedCount: 1 }
    } catch (error: any) {
        console.error('updateCountry error:', error)
        return { success: false, message: 'Failed to update country', error: error.message }
    }
}

// ============================================
// SERVICE OPERATIONS
// ============================================

/**
 * Toggle service visibility (hide/unhide)
 */
export async function toggleServiceVisibility(
    providerId: string,
    externalId: string,
    isActive: boolean,
    adminId?: string
): Promise<InventoryActionResult> {
    try {
        const service = await prisma.providerService.findFirst({
            where: { providerId, externalId }
        })

        if (!service) {
            return { success: false, message: 'Service not found', error: 'NOT_FOUND' }
        }

        await prisma.providerService.update({
            where: { id: service.id },
            data: { isActive }
        })

        // Sync to MeiliSearch
        await syncProviderToMeiliSearch(providerId)

        // Audit log
        if (adminId) {
            await logAdminAction({
                userId: adminId,
                action: isActive ? 'UNHIDE_SERVICE' : 'HIDE_SERVICE',
                resourceType: 'ProviderService',
                resourceId: service.id,
                metadata: { providerId, externalId, name: service.name }
            })
        }

        return {
            success: true,
            message: `Service ${isActive ? 'unhidden' : 'hidden'} successfully`,
            affectedCount: 1
        }
    } catch (error: any) {
        console.error('toggleServiceVisibility error:', error)
        return { success: false, message: 'Failed to toggle visibility', error: error.message }
    }
}

/**
 * Delete a service and cascade to pricing data
 */
export async function deleteService(
    providerId: string,
    externalId: string,
    permanent: boolean = false,
    adminId?: string
): Promise<InventoryActionResult> {
    try {
        const service = await prisma.providerService.findFirst({
            where: { providerId, externalId },
            include: { _count: { select: { pricing: true } } }
        })

        if (!service) {
            return { success: false, message: 'Service not found', error: 'NOT_FOUND' }
        }

        const pricingCount = service._count.pricing

        if (permanent) {
            await prisma.providerService.delete({
                where: { id: service.id }
            })
        } else {
            await prisma.$transaction([
                prisma.providerPricing.updateMany({
                    where: { serviceId: service.id },
                    data: { deleted: true }
                }),
                prisma.providerService.update({
                    where: { id: service.id },
                    data: { isActive: false }
                })
            ])
        }

        // Sync to MeiliSearch
        await syncProviderToMeiliSearch(providerId)

        // Audit log
        if (adminId) {
            await logAdminAction({
                userId: adminId,
                action: permanent ? 'DELETE_SERVICE_PERMANENT' : 'DELETE_SERVICE',
                resourceType: 'ProviderService',
                resourceId: service.id,
                metadata: { providerId, externalId, name: service.name, pricingDeleted: pricingCount }
            })
        }

        return {
            success: true,
            message: `Service deleted${permanent ? ' permanently' : ''} (${pricingCount} pricing entries affected)`,
            affectedCount: pricingCount + 1
        }
    } catch (error: any) {
        console.error('deleteService error:', error)
        return { success: false, message: 'Failed to delete service', error: error.message }
    }
}

/**
 * Update service metadata (name, iconUrl)
 */
export async function updateService(
    providerId: string,
    externalId: string,
    updates: ServiceUpdateData,
    adminId?: string
): Promise<InventoryActionResult> {
    try {
        const service = await prisma.providerService.findFirst({
            where: { providerId, externalId }
        })

        if (!service) {
            return { success: false, message: 'Service not found', error: 'NOT_FOUND' }
        }

        await prisma.providerService.update({
            where: { id: service.id },
            data: updates
        })

        // Sync to MeiliSearch
        await syncProviderToMeiliSearch(providerId)

        // Audit log
        if (adminId) {
            await logAdminAction({
                userId: adminId,
                action: 'UPDATE_SERVICE',
                resourceType: 'ProviderService',
                resourceId: service.id,
                metadata: { providerId, externalId, updates }
            })
        }

        return { success: true, message: 'Service updated successfully', affectedCount: 1 }
    } catch (error: any) {
        console.error('updateService error:', error)
        return { success: false, message: 'Failed to update service', error: error.message }
    }
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Bulk hide/unhide/delete countries
 */
export async function bulkCountryOperation(
    items: Array<{ providerId: string; externalId: string }>,
    action: 'hide' | 'unhide' | 'delete',
    permanent: boolean = false,
    adminId?: string
): Promise<InventoryActionResult> {
    let successCount = 0
    let errorCount = 0
    const affectedProviders = new Set<string>()

    for (const item of items) {
        let result: InventoryActionResult

        if (action === 'hide') {
            result = await toggleCountryVisibility(item.providerId, item.externalId, false)
        } else if (action === 'unhide') {
            result = await toggleCountryVisibility(item.providerId, item.externalId, true)
        } else {
            result = await deleteCountry(item.providerId, item.externalId, permanent)
        }

        if (result.success) {
            successCount++
            affectedProviders.add(item.providerId)
        } else {
            errorCount++
        }
    }

    // Re-sync affected providers
    for (const providerId of affectedProviders) {
        await syncProviderToMeiliSearch(providerId)
    }

    // Audit log
    if (adminId) {
        await logAdminAction({
            userId: adminId,
            action: `BULK_${action.toUpperCase()}_COUNTRIES`,
            resourceType: 'ProviderCountry',
            resourceId: 'bulk',
            metadata: { itemCount: items.length, successCount, errorCount }
        })
    }

    return {
        success: errorCount === 0,
        message: `Bulk operation completed: ${successCount} succeeded, ${errorCount} failed`,
        affectedCount: successCount
    }
}

/**
 * Bulk hide/unhide/delete services
 */
export async function bulkServiceOperation(
    items: Array<{ providerId: string; externalId: string }>,
    action: 'hide' | 'unhide' | 'delete',
    permanent: boolean = false,
    adminId?: string
): Promise<InventoryActionResult> {
    let successCount = 0
    let errorCount = 0
    const affectedProviders = new Set<string>()

    for (const item of items) {
        let result: InventoryActionResult

        if (action === 'hide') {
            result = await toggleServiceVisibility(item.providerId, item.externalId, false)
        } else if (action === 'unhide') {
            result = await toggleServiceVisibility(item.providerId, item.externalId, true)
        } else {
            result = await deleteService(item.providerId, item.externalId, permanent)
        }

        if (result.success) {
            successCount++
            affectedProviders.add(item.providerId)
        } else {
            errorCount++
        }
    }

    // Re-sync affected providers
    for (const providerId of affectedProviders) {
        await syncProviderToMeiliSearch(providerId)
    }

    // Audit log
    if (adminId) {
        await logAdminAction({
            userId: adminId,
            action: `BULK_${action.toUpperCase()}_SERVICES`,
            resourceType: 'ProviderService',
            resourceId: 'bulk',
            metadata: { itemCount: items.length, successCount, errorCount }
        })
    }

    return {
        success: errorCount === 0,
        message: `Bulk operation completed: ${successCount} succeeded, ${errorCount} failed`,
        affectedCount: successCount
    }
}

// ============================================
// MEILISEARCH SYNC
// ============================================

/**
 * Re-index a provider's offers to MeiliSearch
 * Excludes hidden/deleted items and respects visibility flags
 */
export async function syncProviderToMeiliSearch(providerId: string): Promise<InventoryActionResult> {
    try {
        const provider = await prisma.provider.findUnique({
            where: { id: providerId },
            select: { name: true }
        })

        if (!provider) {
            return { success: false, message: 'Provider not found', error: 'NOT_FOUND' }
        }

        // Delete existing offers for this provider
        await deleteOffersByProvider(provider.name)

        // Fetch active pricing with active countries and services only
        const pricing = await prisma.providerPricing.findMany({
            where: {
                providerId,
                deleted: false,
                country: { isActive: true },
                service: { isActive: true }
            },
            include: {
                country: true,
                service: true,
                provider: true
            }
        })

        if (pricing.length === 0) {
            return { success: true, message: 'No active pricing to index', affectedCount: 0 }
        }

        // Build offer documents
        const offers: OfferDocument[] = pricing.map((p, idx) => ({
            id: `${provider.name}_${p.country.externalId}_${p.service.externalId}_${p.operator || 'default'}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
            provider: provider.name,
            countryCode: p.country.externalId,
            countryName: p.country.name,
            flagUrl: p.country.flagUrl || '',
            serviceSlug: p.service.externalId,
            serviceName: p.service.name,
            iconUrl: p.service.iconUrl || undefined,
            operatorId: idx + 1,
            externalOperator: p.operator || undefined,
            operatorDisplayName: '',
            price: Number(p.sellPrice),
            stock: p.stock,
            lastSyncedAt: Date.now()
        }))

        // Index to MeiliSearch
        await indexOffers(offers)

        return {
            success: true,
            message: `Indexed ${offers.length} offers to MeiliSearch`,
            affectedCount: offers.length
        }
    } catch (error: any) {
        console.error('syncProviderToMeiliSearch error:', error)
        return { success: false, message: 'Failed to sync to MeiliSearch', error: error.message }
    }
}

/**
 * Get visibility status for countries/services (for admin UI)
 */
export async function getVisibilityStatus(
    type: 'countries' | 'services',
    providerId?: string
): Promise<Map<string, boolean>> {
    const visibilityMap = new Map<string, boolean>()

    try {
        if (type === 'countries') {
            const countries = await prisma.providerCountry.findMany({
                where: providerId ? { providerId } : undefined,
                select: { providerId: true, externalId: true, isActive: true }
            })
            countries.forEach(c => {
                visibilityMap.set(`${c.providerId}_${c.externalId}`, c.isActive)
            })
        } else {
            const services = await prisma.providerService.findMany({
                where: providerId ? { providerId } : undefined,
                select: { providerId: true, externalId: true, isActive: true }
            })
            services.forEach(s => {
                visibilityMap.set(`${s.providerId}_${s.externalId}`, s.isActive)
            })
        }
    } catch (error) {
        console.error('getVisibilityStatus error:', error)
    }

    return visibilityMap
}
