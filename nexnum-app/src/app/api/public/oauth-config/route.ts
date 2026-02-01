/**
 * Public OAuth Config API
 * 
 * Returns the list of enabled OAuth providers for the login/signup page.
 * Does NOT expose secrets - only provider names and enabled status.
 */

import { NextResponse } from 'next/server'
import { redis } from '@/lib/core/redis'

export const dynamic = 'force-dynamic'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

interface EnabledProvider {
    id: string
    name: string
    enabled: boolean
}

export async function GET() {
    try {
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : null

        // Return only enabled status for each provider
        const providers: EnabledProvider[] = [
            { id: 'google', name: 'Google', enabled: settings?.oauth?.google?.enabled ?? true },
            { id: 'github', name: 'GitHub', enabled: settings?.oauth?.github?.enabled ?? false },
            { id: 'twitter', name: 'Twitter', enabled: settings?.oauth?.twitter?.enabled ?? false },
            { id: 'discord', name: 'Discord', enabled: settings?.oauth?.discord?.enabled ?? false },
            { id: 'facebook', name: 'Facebook', enabled: settings?.oauth?.facebook?.enabled ?? false },
            { id: 'telegram', name: 'Telegram', enabled: settings?.oauth?.telegram?.enabled ?? false },
        ]

        // Filter to only enabled providers
        const enabledProviders = providers.filter(p => p.enabled)

        return NextResponse.json({
            providers: enabledProviders,
            telegramBotUsername: settings?.oauth?.telegram?.enabled
                ? settings?.oauth?.telegram?.botUsername || null
                : null
        })
    } catch (error) {
        console.error('[OAuth Config] Error:', error)
        // Default fallback - only Google enabled
        return NextResponse.json({
            providers: [{ id: 'google', name: 'Google', enabled: true }],
            telegramBotUsername: null
        })
    }
}
