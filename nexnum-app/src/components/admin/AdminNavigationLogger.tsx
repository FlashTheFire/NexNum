
"use client"

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

export function AdminNavigationLogger() {
    const pathname = usePathname()
    // Use a ref to track the last logged path to avoid duplicates if effect re-runs
    const lastLoggedPath = useRef<string | null>(null)

    useEffect(() => {
        if (!pathname) return

        // Avoid logging the same path twice in a row (unless it's a genuine re-visit after going elsewhere)
        // But in a SPA, effect runs on change.
        if (lastLoggedPath.current === pathname) return

        const logNavigation = async () => {
            try {
                await fetch('/api/admin/system/activity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: pathname })
                })
                lastLoggedPath.current = pathname
            } catch (e) {
                console.error('Failed to log navigation', e)
            }
        }

        logNavigation()
    }, [pathname])

    return null
}
