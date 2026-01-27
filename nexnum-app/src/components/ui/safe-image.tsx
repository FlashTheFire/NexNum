"use client"

import { useState, useEffect, ImgHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils/utils'

export interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
    fallbackSrc?: string
    hideOnError?: boolean
}

/**
 * Universal Safe Image Component
 * 
 * Prevents infinite onError loops when fallback images also fail.
 * Supports:
 * - Automatic fallback to provided URL
 * - Option to hide image completely on error
 * - Prevention of recursive error loops
 */
export const SafeImage = forwardRef<HTMLImageElement, SafeImageProps>(
    ({ src, alt, className, fallbackSrc = '/assets/flags/un.svg', hideOnError = false, onError, ...props }, ref) => {
        const [imgSrc, setImgSrc] = useState<string | undefined>(src as string)
        const [hasError, setHasError] = useState(false)

        useEffect(() => {
            setImgSrc(src as string)
            setHasError(false)
        }, [src])

        const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
            // If already invalid or using fallback, prevent loop
            if (hasError) return

            // If we want to hide it
            if (hideOnError) {
                e.currentTarget.style.display = 'none'
                setHasError(true)
                if (onError) onError(e)
                return
            }

            // If target is already the fallback, stop
            if (imgSrc === fallbackSrc) {
                setHasError(true)
                return
            }

            // Switch to fallback
            setImgSrc(fallbackSrc)
            setHasError(true)

            // Call original handler if exists
            if (onError) onError(e)
        }

        return (
            <img
                ref={ref}
                src={imgSrc}
                alt={alt}
                className={cn(className, hasError && hideOnError ? 'hidden' : '')}
                onError={handleError}
                {...props}
            />
        )
    }
)

SafeImage.displayName = 'SafeImage'
