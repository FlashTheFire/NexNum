/**
 * Image Proxy Service
 * 
 * Hides provider URLs by re-hosting images through external APIs.
 * Uses fallback chain: ImgHippo → FreeImage.host → IM.GE
 */

import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

// API Configuration
const APIS = {
    freeimage: {
        url: 'https://freeimage.host/api/1/upload',
        keyEnv: 'FREEIMAGE_API_KEY',
    },
    imge: {
        url: 'https://im.ge/api/1/upload',
        keyEnv: 'IMGE_API_KEY',
    },
} as const

// Cache keys
const CACHE_PREFIX = 'img_proxy:'
const CIRCUIT_BREAKER_KEY = 'circuit:img_proxy'
const CACHE_TTL = 60 * 60 * 24 * 30 // 30 days
const CIRCUIT_THRESHOLD = 5 // Max 5 failures in 1 minute
const CIRCUIT_DURATION = 300 // 5 minutes "Open" state

interface UploadResult {
    success: boolean
    url?: string
    source: 'freeimage' | 'imge' | 'original'
    error?: string
}

/**
 * Upload image to FreeImage.host
 */
async function uploadToFreeImage(imageBuffer: Buffer, filename: string): Promise<string | null> {
    try {
        const apiKey = process.env.FREEIMAGE_API_KEY
        if (!apiKey) return null

        // Convert to base64
        const base64 = imageBuffer.toString('base64')

        const formData = new FormData()
        formData.append('key', apiKey)
        formData.append('action', 'upload')
        formData.append('source', base64)
        formData.append('format', 'json')

        const response = await fetch(APIS.freeimage.url, {
            method: 'POST',
            body: formData,
        })

        const data = await response.json()

        if (data.status_code === 200 && data.image?.url) {
            return data.image.url
        }

        logger.warn('FreeImage upload failed', { status: data.status_code })
        return null
    } catch (error) {
        logger.error('FreeImage upload error', { error: (error as Error).message })
        return null
    }
}

/**
 * Upload image to IM.GE
 */
async function uploadToImge(imageBuffer: Buffer, filename: string): Promise<string | null> {
    const apiKey = process.env.IMGE_API_KEY
    if (!apiKey) return null

    try {
        // Convert to base64
        const base64 = imageBuffer.toString('base64')

        const formData = new FormData()
        formData.append('source', base64)

        const response = await fetch(APIS.imge.url, {
            method: 'POST',
            headers: {
                'X-API-Key': apiKey,
            },
            body: formData,
        })

        const data = await response.json()

        if (data.status_code === 200 && data.image?.url) {
            return data.image.url
        }

        logger.warn('IM.GE upload failed', { status: data.status_code })
        return null
    } catch (error) {
        logger.error('IM.GE upload error', { error: (error as Error).message })
        return null
    }
}

/**
 * Download image from URL
 */
async function downloadImage(url: string): Promise<{ buffer: Buffer; filename: string } | null> {
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000) // 5s timeout

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*',
            },
            signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!response.ok) {
            // Silently fail - use original URL
            return null
        }

        const buffer = Buffer.from(await response.arrayBuffer())

        // Extract filename from URL
        const urlParts = new URL(url)
        let filename = urlParts.pathname.split('/').pop() || 'image.png'

        // Ensure extension
        if (!filename.includes('.')) {
            const contentType = response.headers.get('content-type') || 'image/png'
            const ext = contentType.split('/')[1] || 'png'
            filename = `${filename}.${ext}`
        }

        return { buffer, filename }
    } catch (error) {
        // Silently fail - network errors are expected for some providers
        return null
    }
}

/**
 * Proxy an image URL through external hosting
 * 
 * @param sourceUrl Original image URL from provider
 * @returns Proxied URL or original URL on failure
 */
export async function proxyImage(sourceUrl: string): Promise<UploadResult> {
    // 1. Check Circuit Breaker
    try {
        const isTripped = await redis.get(CIRCUIT_BREAKER_KEY)
        if (isTripped) {
            return { success: false, url: sourceUrl, source: 'original', error: 'Circuit Breaker Open' }
        }
    } catch (e) { }

    // 2. Special Case: GrizzlySMS webp files need to be converted to jpg
    let processedUrl = sourceUrl
    if (sourceUrl.includes('grizzlysms.com') && sourceUrl.endsWith('.webp')) {
        processedUrl = sourceUrl.replace(/\.webp$/, '.jpg')
    }

    // 3. Skip if already proxied or safe internal/CDN URL
    if (
        processedUrl.includes('imghippo.com') ||
        processedUrl.includes('freeimage.host') ||
        processedUrl.includes('im.ge') ||
        processedUrl.includes('iili.io') ||
        processedUrl.startsWith('/') ||
        processedUrl.includes('dicebear') ||
        processedUrl.includes('flagcdn.com')
    ) {
        return { success: true, url: processedUrl, source: 'original' }
    }

    // 4. Check cache first
    const cacheKey = `${CACHE_PREFIX}${Buffer.from(processedUrl).toString('base64').slice(0, 64)}`

    try {
        const cached = await redis.get(cacheKey) as string | null
        if (cached) {
            return { success: true, url: cached, source: 'original' }
        }
    } catch (e) {
        // Cache miss, continue
    }

    // 5. Download image
    const downloaded = await downloadImage(processedUrl)
    if (!downloaded) {
        return { success: false, url: processedUrl, source: 'original', error: 'Download failed' }
    }

    const { buffer, filename } = downloaded

    // 6. Try APIs in order
    let proxiedUrl: string | null = null
    let source: UploadResult['source'] = 'original'

    try {
        // 1. FreeImage.host (primary)
        proxiedUrl = await uploadToFreeImage(buffer, filename)
        if (proxiedUrl) {
            source = 'freeimage'
        }

        // 2. IM.GE (fallback)
        if (!proxiedUrl) {
            proxiedUrl = await uploadToImge(buffer, filename)
            if (proxiedUrl) {
                source = 'imge'
            }
        }
    } catch (error) {
        logger.error('Proxy upload sequence failed', { error: (error as Error).message })
    }

    if (proxiedUrl) {
        // Cache the result
        try {
            await redis.set(cacheKey, proxiedUrl, 'EX', CACHE_TTL)
        } catch (e) { }

        logger.info('Image proxied successfully', { source, original: processedUrl.slice(0, 50) })
        return { success: true, url: proxiedUrl, source }
    }

    // 7. Handle Failure (Update Circuit Breaker)
    try {
        const failureKey = `${CIRCUIT_BREAKER_KEY}:failures`
        const failures = await redis.incr(failureKey)
        if (failures === 1) await redis.expire(failureKey, 60)

        if (failures >= CIRCUIT_THRESHOLD) {
            logger.error('[CircuitBreaker] Tripping for Image Proxy', { failures })
            await redis.setex(CIRCUIT_BREAKER_KEY, CIRCUIT_DURATION, 'active')
        }
    } catch (e) { }

    // All failed, return original
    logger.warn('All image proxy APIs failed, using original', { url: processedUrl.slice(0, 50) })
    return { success: false, url: processedUrl, source: 'original', error: 'All APIs failed' }
}

/**
 * Batch proxy multiple images
 */
export async function proxyImages(urls: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>()

    // Process in parallel with concurrency limit
    const batchSize = 5

    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize)
        const promises = batch.map(async (url) => {
            const result = await proxyImage(url)
            return { original: url, proxied: result.url || url }
        })

        const batchResults = await Promise.all(promises)
        for (const { original, proxied } of batchResults) {
            results.set(original, proxied)
        }
    }

    return results
}

/**
 * Check if URL is already proxied
 */
export function isProxiedUrl(url: string): boolean {
    return (
        url.includes('imghippo.com') ||
        url.includes('freeimage.host') ||
        url.includes('im.ge')
    )
}
