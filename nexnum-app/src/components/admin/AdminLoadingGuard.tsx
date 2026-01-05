"use client"

import { useAuthStore } from "@/stores/authStore"
import LoadingScreen from "@/components/ui/LoadingScreen"
import { useEffect } from "react"

export function AdminLoadingGuard({ children }: { children: React.ReactNode }) {
    const { isLoading, checkAuth, isAuthenticated } = useAuthStore()

    useEffect(() => {
        checkAuth()
    }, [checkAuth])

    if (isLoading) {
        return <LoadingScreen status="Accessing Admin Protocol" />
    }

    // Even if finished loading, if not authenticated, we probably shouldn't show the admin layout
    // although middleware handles redirects, this adds extra safety before client-side redirect happens.
    if (!isAuthenticated) {
        return null
    }

    return <>{children}</>
}
