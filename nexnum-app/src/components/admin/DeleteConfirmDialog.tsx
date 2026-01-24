"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DeleteConfirmDialogProps {
    title: string
    description: string
    itemName: string
    isOpen: boolean
    isLoading?: boolean
    onClose: () => void
    onConfirm: (permanent: boolean) => Promise<void>
}

export function DeleteConfirmDialog({
    title,
    description,
    itemName,
    isOpen,
    isLoading = false,
    onClose,
    onConfirm
}: DeleteConfirmDialogProps) {
    const [deletePermanent, setDeletePermanent] = useState(false)

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

                    {/* Dialog Container - flex centering for better mobile support */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="w-full max-w-sm pointer-events-auto"
                        >
                            <div className="bg-[#111318] border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden">
                                {/* Icon */}
                                <div className="pt-6 flex justify-center">
                                    <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/20 flex items-center justify-center">
                                        <AlertTriangle size={28} className="text-red-400" />
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-6 text-center">
                                    <h2 className="text-xl font-bold text-white mb-2">
                                        {title}
                                    </h2>
                                    <p className="text-gray-400 text-sm mb-4">
                                        {description}
                                    </p>

                                    {/* Item being deleted */}
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                                        <code className="text-red-300 text-sm font-mono">{itemName}</code>
                                    </div>

                                    {/* Permanent delete option */}
                                    <div
                                        className="flex items-center justify-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5 cursor-pointer hover:border-orange-500/30 transition-colors"
                                        onClick={() => setDeletePermanent(!deletePermanent)}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${deletePermanent
                                            ? 'bg-orange-500 border-orange-500'
                                            : 'border-white/20'
                                            }`}>
                                            {deletePermanent && (
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    className="w-2 h-2 bg-white rounded-sm"
                                                />
                                            )}
                                        </div>
                                        <span className="text-sm text-gray-300">
                                            Delete permanently (cannot undo)
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-2 bg-black/20">
                                    <Button
                                        variant="ghost"
                                        onClick={onClose}
                                        disabled={isLoading}
                                        className="text-gray-400"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={() => onConfirm(deletePermanent)}
                                        disabled={isLoading}
                                        className="bg-red-600 hover:bg-red-500 text-white"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 size={14} className="mr-2 animate-spin" />
                                                Deleting...
                                            </>
                                        ) : (
                                            <>
                                                <Trash2 size={14} className="mr-2" />
                                                Delete
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    )
}
