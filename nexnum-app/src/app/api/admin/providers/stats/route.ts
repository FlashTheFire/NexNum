/**
 * Provider Stats API
 * 
 * Returns real-time health metrics for all providers
 * Used by Admin Command Center dashboard
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { healthMonitor } from '@/lib/providers/health-monitor'

export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        // Get all providers with their DB config
        const providers = await prisma.provider.findMany({
            select: {
                id: true,
                name: true,
                displayName: true,
                isActive: true,
                priority: true,
                priceMultiplier: true,
                fixedMarkup: true,
                mappings: true, // Weight stored in mappings JSON
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { priority: 'asc' }
        })

        // Enrich with real-time health data
        const stats = await Promise.all(providers.map(async (provider) => {
            const health = await healthMonitor.getHealth(provider.id)

            // Calculate estimated revenue impact
            const recentOrders = await prisma.number.count({
                where: {
                    provider: provider.name,
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                }
            })

            return {
                // DB Config
                id: provider.id,
                name: provider.name,
                displayName: provider.displayName,
                isActive: provider.isActive,
                priority: provider.priority,
                priceMultiplier: Number(provider.priceMultiplier),
                fixedMarkup: Number(provider.fixedMarkup),
                weight: Number((provider.mappings as any)?.weight) || 1.0,

                // Real-time Health
                status: health.status,
                circuitState: health.circuitState,
                successRate: Math.round(health.successRate * 100),
                avgLatency: Math.round(health.avgLatency),
                consecutiveFailures: health.consecutiveFailures,
                lastError: health.lastError,

                // Metrics
                ordersLast24h: recentOrders,

                // Computed Score (same as weighted selection)
                score: calculateScore(health, provider)
            }
        }))

        // Sort by score for display
        stats.sort((a, b) => b.score - a.score)

        return NextResponse.json({
            providers: stats,
            summary: {
                total: stats.length,
                active: stats.filter(s => s.isActive).length,
                healthy: stats.filter(s => s.status === 'healthy').length,
                degraded: stats.filter(s => s.status === 'degraded').length,
                down: stats.filter(s => s.status === 'down').length,
            },
            updatedAt: new Date().toISOString()
        })
    } catch (error: any) {
        console.error('Provider stats error:', error)
        return NextResponse.json({ error: 'Failed to fetch provider stats' }, { status: 500 })
    }
}

function calculateScore(health: any, provider: any): number {
    const successRate = health.successRate || 0.5
    const latency = Math.max(health.avgLatency || 100, 50)
    const costMultiplier = Number(provider.priceMultiplier) || 1.0
    const adminWeight = Number(provider.weight) || 1.0
    const priorityBoost = 1 / (Number(provider.priority) || 1)
    const normalizedLatency = latency / 100

    return Math.round(
        ((successRate * adminWeight * priorityBoost) / (normalizedLatency * costMultiplier)) * 100
    ) / 100
}
