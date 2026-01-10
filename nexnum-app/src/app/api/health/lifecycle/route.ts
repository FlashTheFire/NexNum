/**
 * Lifecycle Health Check Endpoint
 * 
 * Returns the health status of the NumberLifecycleManager,
 * including queue statistics and circuit breaker state.
 */

import { NextResponse } from 'next/server'
import { lifecycleManager } from '@/lib/number-lifecycle-manager'

export async function GET() {
    try {
        // Lazy Init: Ensure it's running if instrumentation missed it
        await lifecycleManager.initialize()

        const stats = await lifecycleManager.getStats()

        const isHealthy = stats.circuitState === 'closed' || stats.circuitState === 'half-open'

        return NextResponse.json({
            healthy: isHealthy,
            timestamp: new Date().toISOString(),
            engine: 'pg-boss (PostgreSQL)',
            queues: stats.queues,
            lastError: lifecycleManager.lastError, // Expose init error
            circuit: {
                state: stats.circuitState,
                description: getCircuitDescription(stats.circuitState),
            },
        }, {
            status: isHealthy ? 200 : 503,
        })
    } catch (error: any) {
        console.error('[Health] Error:', error)
        return NextResponse.json({
            healthy: false,
            error: `Lifecycle manager not available: ${error.message}`,
            timestamp: new Date().toISOString(),
        }, {
            status: 503,
        })
    }
}

function getCircuitDescription(state: string): string {
    switch (state) {
        case 'closed':
            return 'All systems operational'
        case 'open':
            return 'Provider experiencing issues - requests blocked'
        case 'half-open':
            return 'Testing provider connectivity'
        default:
            return 'Unknown state'
    }
}
