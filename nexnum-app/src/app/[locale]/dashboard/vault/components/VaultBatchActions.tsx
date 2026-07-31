"use client"

import { useState } from "react"
import { Download, Copy, Check, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface VaultBatchActionsProps {
    records: any[]
}

export function VaultBatchActions({ records }: VaultBatchActionsProps) {
    const [copiedAll, setCopiedAll] = useState(false)

    const activeNumbers = records.filter(r => r.currentStatus === 'active')

    const handleCopyAllActive = () => {
        if (activeNumbers.length === 0) {
            toast.error("No active numbers to copy")
            return
        }
        const text = activeNumbers.map(r => r.number).join("\n")
        navigator.clipboard.writeText(text)
        setCopiedAll(true)
        toast.success(`Copied ${activeNumbers.length} active numbers to clipboard!`)
        setTimeout(() => setCopiedAll(false), 2000)
    }

    const handleExportCSV = () => {
        if (records.length === 0) {
            toast.error("No numbers in vault to export")
            return
        }

        const headers = ["Phone Number", "Service", "Country", "Status", "SMS Count", "Purchased At", "Expires At"]
        const csvRows = [
            headers.join(","),
            ...records.map(r => [
                `"${r.number}"`,
                `"${r.serviceName || ''}"`,
                `"${r.countryName || ''}"`,
                `"${r.currentStatus}"`,
                r.smsCount || 0,
                `"${r.purchasedAt || ''}"`,
                `"${r.expiresAt || ''}"`
            ].join(","))
        ]

        const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.setAttribute("href", url)
        link.setAttribute("download", `NexNum_Vault_Export_${new Date().toISOString().slice(0, 10)}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success("Vault activation history exported to CSV!")
    }

    return (
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAllActive}
                disabled={activeNumbers.length === 0}
                className="h-9 px-3 rounded-xl border-white/10 bg-zinc-900/50 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-all disabled:opacity-40"
            >
                {copiedAll ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
                ) : (
                    <Copy className="w-3.5 h-3.5 text-[hsl(var(--neon-lime))] mr-1.5" />
                )}
                Copy Active ({activeNumbers.length})
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={records.length === 0}
                className="h-9 px-3 rounded-xl border-white/10 bg-zinc-900/50 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-all disabled:opacity-40"
            >
                <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400 mr-1.5" />
                Export CSV
            </Button>
        </div>
    )
}
