import { useState } from 'react'
import { toast } from 'sonner'
import { InventoryItemType, InventoryAction } from '@/lib/admin/unified-inventory' // Type import only

interface ActionParams {
    providerId: string
    externalId: string
    type?: InventoryItemType
    name?: string
}

interface UpdateParams extends ActionParams {
    updates: {
        name: string
        iconUrl?: string
        flagUrl?: string
    }
}

interface UseInventoryActionsOptions {
    onSuccess?: () => void
}

export function useInventoryActions(options?: UseInventoryActionsOptions) {
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const executeAction = async (
        action: InventoryAction,
        params: ActionParams & { payload?: any, permanent?: boolean }
    ) => {
        const id = `${params.providerId}:${params.externalId}`
        setLoadingId(id)

        try {
            const res = await fetch('/api/admin/inventory/actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId: params.providerId,
                    externalId: params.externalId,
                    type: params.type || 'auto',
                    action,
                    payload: params.payload,
                    permanent: params.permanent
                })
            })

            const data = await res.json()

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Action failed')
            }

            toast.success(data.message || 'Success')
            options?.onSuccess?.()
            return true

        } catch (error: any) {
            console.error('Inventory action failed:', error)
            toast.error(error.message || 'Failed to execute action')
            return false
        } finally {
            setLoadingId(null)
        }
    }

    const toggleVisibility = async (item: ActionParams, isVisible: boolean) => {
        return executeAction(isVisible ? 'unhide' : 'hide', item)
    }

    const updateItem = async (params: UpdateParams) => {
        return executeAction('update', {
            ...params,
            payload: params.updates
        })
    }

    const deleteItem = async (params: ActionParams, permanent: boolean = false) => {
        return executeAction('delete', {
            ...params,
            permanent
        })
    }

    return {
        loadingId,
        toggleVisibility,
        updateItem,
        deleteItem
    }
}
