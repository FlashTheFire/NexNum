import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { logAdminAction } from '@/lib/core/auditLog'
import { SettingsService, AppSettings } from '@/lib/settings'

/**
 * GET /api/admin/settings
 * Retrieve all admin settings
 */
export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const settings = await SettingsService.getSettings()
        return NextResponse.json({
            settings,
            lastUpdated: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Settings fetch error:', error)
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }
}

/**
 * PATCH /api/admin/settings
 * Update admin settings
 */
export async function PATCH(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const body = await request.json()
        const { section, updates } = body

        if (!section || !updates) {
            return NextResponse.json({ error: 'Section and updates required' }, { status: 400 })
        }

        // Validate section
        const validSections: (keyof AppSettings)[] = ['general', 'pricing', 'rateLimit', 'notifications']
        if (!validSections.includes(section as any)) {
            return NextResponse.json({ error: 'Invalid settings section' }, { status: 400 })
        }

        // Update settings
        const updatedSettings = await SettingsService.updateSettings(
            section as keyof AppSettings,
            updates
        )

        // Log the action
        await logAdminAction({
            userId: auth.userId,
            action: 'SETTINGS_CHANGE',
            resourceType: 'settings',
            resourceId: section,
            metadata: { updates },
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        })

        return NextResponse.json({
            success: true,
            message: `Settings section '${section}' updated`,
            section,
            updates,
            settings: updatedSettings
        })

    } catch (error) {
        console.error('Settings update error:', error)
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }
}
