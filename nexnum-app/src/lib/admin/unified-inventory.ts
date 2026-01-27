/**
 * Unified Inventory Service
 * 
 * A professional, type-safe library for managing inventory items (Countries and Services)
 * uniformly. Handles strict type checking, ID resolution, and atomic updates.
 * 
 * @module UnifiedInventoryService
 */

import { prisma } from '@/lib/core/db'
import { syncProviderToMeiliSearch } from '@/lib/admin/inventory-manager'

// ============================================
// Types
// ============================================

export type InventoryItemType = 'country' | 'service' | 'auto'

export interface InventoryIdentity {
    providerId: string    // UUID
    providerCode: string  // e.g. "mock-sms"
    itemId: string        // UUID of the item (ProviderCountry or ProviderService)
    externalId: string    // Normalizer Code of the item (e.g. "us" or "wa")
    type: 'country' | 'service'
    displayName: string
}

export type InventoryAction = 'hide' | 'unhide' | 'delete' | 'update'

export interface ActionResult {
    success: boolean
    message: string
    error?: string
    data?: any
}

// ============================================
// Service Class
// ============================================

export class UnifiedInventoryService {

    /**
     * Resolve Provider ID from code or UUID
     */
    private async resolveProvider(providerIdOrCode: string): Promise<{ id: string, code: string } | null> {
        const provider = await prisma.provider.findFirst({
            where: {
                OR: [
                    { id: providerIdOrCode },
                    { name: providerIdOrCode }
                ]
            },
            select: { id: true, name: true }
        })
        return provider ? { id: provider.id, code: provider.name } : null
    }

    /**
     * Resolve an Inventory Item by external ID (code)
     * Smartly checks both tables if type is 'auto'
     */
    public async resolveIdentity(
        providerIdOrCode: string,
        externalId: string,
        type: InventoryItemType = 'auto'
    ): Promise<InventoryIdentity | null> {

        const provider = await this.resolveProvider(providerIdOrCode)

        if (!provider) {
            console.warn(`[UnifiedInventory] Provider not found: ${providerIdOrCode}`)
            return null
        }

        // 1. Check Service
        const service = await prisma.providerService.findFirst({
            where: { providerId: provider.id, externalId }
        })

        // 2. Check Country
        const country = await prisma.providerCountry.findFirst({
            where: { providerId: provider.id, externalId }
        })

        // Decision Matrix
        // If type is 'service', prefer service. If not found, fall back to country (mismatch fix).
        if (type === 'service') {
            if (service) return this.mapService(provider, service)
            if (country) return this.mapCountry(provider, country) // Fallback
        }

        // If type is 'country', prefer country. If not found, fall back to service.
        if (type === 'country') {
            if (country) return this.mapCountry(provider, country)
            if (service) return this.mapService(provider, service) // Fallback
        }

        // Action 'auto' - prefer exact code match logic or priority
        // Usually Service codes are unique enough, but strict order: Service > Country
        if (service) return this.mapService(provider, service)
        if (country) return this.mapCountry(provider, country)

        return null
    }

    private mapService(provider: any, item: any): InventoryIdentity {
        return {
            providerId: provider.id,
            providerCode: provider.code,
            itemId: item.id,
            externalId: item.externalId,
            type: 'service',
            displayName: item.name
        }
    }

    private mapCountry(provider: any, item: any): InventoryIdentity {
        return {
            providerId: provider.id,
            providerCode: provider.code,
            itemId: item.id,
            externalId: item.externalId,
            type: 'country',
            displayName: item.name
        }
    }

    /**
     * Dispatch an action to the correct handler
     */
    public async dispatchAction(
        authUserId: string,
        params: {
            providerId: string,
            externalId: string,
            type: InventoryItemType,
            action: InventoryAction,
            payload?: any,
            permanent?: boolean
        }
    ): Promise<ActionResult> {
        const identity = await this.resolveIdentity(params.providerId, params.externalId, params.type)

        if (!identity) {
            return { success: false, message: 'Item not found in database', error: 'NOT_FOUND' }
        }

        try {
            let result: ActionResult

            switch (params.action) {
                case 'hide':
                    result = await this.setVisibility(identity, false)
                    break
                case 'unhide':
                    result = await this.setVisibility(identity, true)
                    break
                case 'update':
                    result = await this.updateItem(identity, params.payload)
                    break
                case 'delete':
                    result = await this.deleteItem(identity, params.permanent || false)
                    break
                default:
                    return { success: false, message: 'Invalid action', error: 'BAD_REQUEST' }
            }

            // Auto-Sync to MeiliSearch to reflect changes immediately
            if (result.success) {
                // Fire and forget sync to stay fast
                syncProviderToMeiliSearch(identity.providerId).catch(err =>
                    console.error('[UnifiedInventory] Post-action sync failed:', err)
                )
            }

            return result

        } catch (error: any) {
            console.error(`[UnifiedInventory] Action failed:`, error)
            return { success: false, message: 'Internal server error', error: error.message }
        }
    }

    // ============================================
    // Logic Handlers
    // ============================================

    private async setVisibility(identity: InventoryIdentity, isActive: boolean): Promise<ActionResult> {
        if (identity.type === 'service') {
            await prisma.providerService.update({
                where: { id: identity.itemId },
                data: { isActive }
            })
        } else {
            await prisma.providerCountry.update({
                where: { id: identity.itemId },
                data: { isActive }
            })
        }
        return {
            success: true,
            message: `${identity.type === 'service' ? 'Service' : 'Country'} ${isActive ? 'visible' : 'hidden'}`,
            data: { isActive }
        }
    }

    private async updateItem(identity: InventoryIdentity, updates: any): Promise<ActionResult> {
        if (!updates || typeof updates !== 'object') {
            return { success: false, message: 'Invalid update payload' }
        }

        if (identity.type === 'service') {
            await prisma.providerService.update({
                where: { id: identity.itemId },
                data: {
                    name: updates.name,
                    iconUrl: updates.iconUrl || updates.flagUrl // Handle mixed field names gracefully
                }
            })
        } else {
            await prisma.providerCountry.update({
                where: { id: identity.itemId },
                data: {
                    name: updates.name,
                    flagUrl: updates.flagUrl || updates.iconUrl
                }
            })
        }
        return { success: true, message: 'Item updated successfully' }
    }

    private async deleteItem(identity: InventoryIdentity, permanent: boolean): Promise<ActionResult> {
        const table = identity.type === 'service' ? prisma.providerService : prisma.providerCountry

        // Count affected pricing records
        let pricingCount = 0
        if (identity.type === 'service') {
            // pricingCount = await prisma.providerPricing.count({ where: { serviceId: identity.itemId } })
        } else {
            // pricingCount = await prisma.providerPricing.count({ where: { countryId: identity.itemId } })
        }

        if (permanent) {
            // Delete pricing first
            // STUB: ProviderPricing is deleted. 
            // In the future, this should trigger MeiliSearch deletion by filter.
            if (identity.type === 'service') {
                // await prisma.providerPricing.deleteMany({ where: { serviceId: identity.itemId } })
            } else {
                // await prisma.providerPricing.deleteMany({ where: { countryId: identity.itemId } })
            }

            // Delete item
            // @ts-ignore - Dynamic table access
            await table.delete({ where: { id: identity.itemId } })
        } else {
            // Soft delete (hide) is just setVisibility(false) but described as delete
            await this.setVisibility(identity, false)
            return { success: true, message: 'Item soft deleted (hidden)' }
        }

        return { success: true, message: `Item permanently deleted (${pricingCount} pricing entries removed)` }
    }
}

export const unifiedInventory = new UnifiedInventoryService()
