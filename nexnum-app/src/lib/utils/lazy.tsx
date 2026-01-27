/**
 * Lazy Loading Utilities for Bundle Optimization
 * Use these helpers to dynamically import heavy components
 */
import dynamic from 'next/dynamic'
import { ComponentType } from 'react'

// Loading spinner for lazy components
const LoadingSpinner = () => (
    <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
)

// Skeleton loader for content areas
const ContentSkeleton = () => (
    <div className="animate-pulse space-y-4 p-4">
        <div className="h-4 bg-gray-700/50 rounded w-3/4" />
        <div className="h-4 bg-gray-700/50 rounded w-1/2" />
        <div className="h-32 bg-gray-700/50 rounded" />
    </div>
)

/**
 * Create a lazy-loaded component with loading state
 */
export function lazyComponent<P extends object>(
    importFn: () => Promise<{ default: ComponentType<P> }>,
    options: {
        ssr?: boolean
        loading?: 'spinner' | 'skeleton' | 'none'
    } = {}
) {
    const { ssr = false, loading = 'spinner' } = options

    return dynamic(importFn, {
        ssr,
        loading: () => {
            if (loading === 'spinner') return <LoadingSpinner />
            if (loading === 'skeleton') return <ContentSkeleton />
            return null
        },
    })
}

/**
 * Pre-fetch a lazy component's bundle
 * Useful for loading modals or pages when user hovers a trigger
 */
export function preloadComponent(importFn: () => Promise<any>) {
    const isServer = typeof window === 'undefined'
    if (!isServer) {
        importFn().catch(() => {
            // Silently ignore prefetch errors
        })
    }
}

// Pre-configured lazy loaders for common patterns
export const lazyModal = <P extends object>(
    importFn: () => Promise<{ default: ComponentType<P> }>
) => {
    const Comp = lazyComponent(importFn, { ssr: false, loading: 'spinner' })
    // Attach preload to the component for easy access
    // @ts-ignore
    Comp.preload = () => preloadComponent(importFn)
    return Comp
}

export const lazyPage = <P extends object>(
    importFn: () => Promise<{ default: ComponentType<P> }>
) => lazyComponent(importFn, { ssr: true, loading: 'skeleton' })

export const lazyWidget = <P extends object>(
    importFn: () => Promise<{ default: ComponentType<P> }>
) => lazyComponent(importFn, { ssr: false, loading: 'none' })
