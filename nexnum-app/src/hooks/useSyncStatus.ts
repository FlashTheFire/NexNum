import { useState, useEffect } from 'react'

export function useSyncStatus(providerId?: string) {
    const [isSyncing, setIsSyncing] = useState(false)
    const [lastChecked, setLastChecked] = useState(Date.now())

    useEffect(() => {
        let mounted = true
        let timeout: NodeJS.Timeout

        const checkStatus = async () => {
            if (!mounted) return
            try {
                const res = await fetch('/api/admin/sync/status')
                if (res.ok) {
                    const data = await res.json()
                    if (data.status?.isSyncing) {
                        setIsSyncing(true)
                        // Poll faster when syncing
                        timeout = setTimeout(checkStatus, 2000)
                    } else {
                        setIsSyncing(false)
                        // Poll slower when idle
                        timeout = setTimeout(checkStatus, 10000)
                    }
                }
            } catch {
                // Error, retry slow
                timeout = setTimeout(checkStatus, 15000)
            }
        }

        checkStatus()

        return () => {
            mounted = false
            clearTimeout(timeout)
        }
    }, [])

    return { isSyncing }
}
