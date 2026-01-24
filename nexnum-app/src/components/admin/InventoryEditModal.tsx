"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Save, Loader2, Image as ImageIcon, Globe, Smartphone, Link2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

interface InventoryEditModalProps {
    type: 'country' | 'service'
    providerId: string
    providerDisplayName: string
    externalId: string
    currentData: {
        name: string
        flagUrl?: string
        iconUrl?: string
    }
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

export function InventoryEditModal({
    type,
    providerId,
    providerDisplayName,
    externalId,
    currentData,
    isOpen,
    onClose,
    onSuccess
}: InventoryEditModalProps) {
    const [name, setName] = useState(currentData.name)
    const [imageUrl, setImageUrl] = useState(currentData.flagUrl || currentData.iconUrl || '')
    const [saving, setSaving] = useState(false)
    const [previewError, setPreviewError] = useState(false)

    const isCountry = type === 'country'
    const endpoint = isCountry ? '/api/admin/inventory/countries' : '/api/admin/inventory/services'
    const imageLabel = isCountry ? 'Flag URL' : 'Icon URL'
    const Icon = isCountry ? Globe : Smartphone

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('Name is required')
            return
        }

        setSaving(true)
        try {
            const updates = {
                name: name.trim(),
                ...(isCountry ? { flagUrl: imageUrl || null } : { iconUrl: imageUrl || null })
            }

            const res = await fetch(endpoint, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId,
                    externalId,
                    action: 'edit',
                    updates
                })
            })

            const data = await res.json()

            if (res.ok && data.success) {
                toast.success(`${isCountry ? 'Country' : 'Service'} updated successfully`)
                onSuccess()
                onClose()
            } else {
                toast.error(data.error || 'Failed to update')
            }
        } catch (error) {
            toast.error('Failed to save changes')
        } finally {
            setSaving(false)
        }
    }

    const hasChanges = name !== currentData.name ||
        imageUrl !== (currentData.flagUrl || currentData.iconUrl || '')

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Modal Container - flex centering for better mobile support */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="w-full max-w-md pointer-events-auto my-auto"
                        >
                            <div className="bg-[#111318] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                                            <Icon size={18} />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-white">
                                                Edit {isCountry ? 'Country' : 'Service'}
                                            </h2>
                                            <p className="text-xs text-gray-500">
                                                {providerDisplayName} · <code className="text-gray-600">{externalId}</code>
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                                        onClick={onClose}
                                    >
                                        <X size={16} />
                                    </Button>
                                </div>

                                {/* Content - scrollable */}
                                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                                    {/* Name Field */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-300">
                                            Display Name
                                        </label>
                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="bg-black/30 border-white/10 focus:border-blue-500/50"
                                            placeholder={isCountry ? "e.g., India" : "e.g., Discord"}
                                        />
                                    </div>

                                    {/* Image URL Field */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                            <Link2 size={14} className="text-gray-500" />
                                            {imageLabel}
                                        </label>
                                        <Input
                                            value={imageUrl}
                                            onChange={(e) => {
                                                setImageUrl(e.target.value)
                                                setPreviewError(false)
                                            }}
                                            className="bg-black/30 border-white/10 focus:border-blue-500/50 font-mono text-xs"
                                            placeholder="https://example.com/image.png"
                                        />
                                    </div>

                                    {/* Image Preview */}
                                    {imageUrl && (
                                        <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Preview</p>
                                            <div className="flex items-center gap-4">
                                                <div className="w-16 h-12 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                    {previewError ? (
                                                        <ImageIcon size={20} className="text-gray-600" />
                                                    ) : (
                                                        <img
                                                            src={imageUrl}
                                                            alt="Preview"
                                                            className="w-full h-full object-cover"
                                                            onError={() => setPreviewError(true)}
                                                            onLoad={() => setPreviewError(false)}
                                                        />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-sm text-white font-medium">{name || 'Untitled'}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {previewError ? 'Failed to load image' : 'Image loaded'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer - fixed at bottom */}
                                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-black/20 shrink-0">
                                    <p className="text-xs text-gray-500">
                                        {hasChanges ? 'Unsaved changes' : 'No changes'}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            onClick={onClose}
                                            disabled={saving}
                                            className="text-gray-400"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={handleSave}
                                            disabled={saving || !hasChanges}
                                            className="bg-blue-600 hover:bg-blue-500 text-white"
                                        >
                                            {saving ? (
                                                <>
                                                    <Loader2 size={14} className="mr-2 animate-spin" />
                                                    Saving...
                                                </>
                                            ) : (
                                                <>
                                                    <Save size={14} className="mr-2" />
                                                    Save Changes
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    )
}
