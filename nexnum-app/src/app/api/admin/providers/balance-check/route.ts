
import { NextResponse } from "next/server"
import { prisma } from "@/lib/core/db"
import { getProviderAdapter } from "@/lib/providers/provider-factory"
import { DynamicProvider } from "@/lib/providers/dynamic-provider"
import { AuthGuard } from "@/lib/auth/guard"

// POST /api/admin/providers/balance-check
// Trigger sync for all active providers
export async function POST(request: Request) {
    // Require admin authentication
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        let providers;
        try {
            providers = await prisma.provider.findMany({
                where: { isActive: true }
            })
        } catch (queryError) {
            // Fallback: Get all providers if isActive column check fails
            console.warn('[BALANCE_CHECK] Query failed, using fallback:', queryError);
            providers = await prisma.provider.findMany();
        }

        const results = await Promise.all(providers.map(async (p) => {
            try {
                const engine = getProviderAdapter(p)
                // Always DynamicProvider in new architecture
                // DynamicProvider has syncBalance which also updates DB
                const balance = await (engine as DynamicProvider).syncBalance()

                return {
                    // Don't expose internal provider name
                    providerId: p.id,
                    displayName: p.displayName,
                    balance,
                    status: 'success'
                }
            } catch (e) {
                return {
                    providerId: p.id,
                    displayName: p.displayName,
                    error: e instanceof Error ? e.message : 'Unknown error',
                    status: 'error'
                }
            }
        }))

        return NextResponse.json({ results })
    } catch (error) {
        console.error('[BALANCE_CHECK] POST error:', error);
        return NextResponse.json(
            { error: "Failed to sync balances" },
            { status: 500 }
        )
    }
}

// GET /api/admin/providers/balance-check
// Get current low balance alerts
export async function GET(request: Request) {
    // Require admin authentication
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        let providers;
        try {
            providers = await prisma.provider.findMany({
                where: { isActive: true }
            })
        } catch (queryError) {
            // Fallback: Get all providers if query fails
            console.warn('[BALANCE_CHECK] GET query failed, using fallback:', queryError);
            providers = await prisma.provider.findMany();
        }

        // Filter in memory for balance < threshold with safe access
        const alerts = providers.filter(p => {
            // @ts-ignore - balance may not exist in fallback
            const bal = Number(p.balance || 0)
            // @ts-ignore - lowBalanceAlert may not exist in fallback  
            const thresh = Number(p.lowBalanceAlert || 10)
            return bal < thresh
        }).map(p => ({
            id: p.id,
            // Use displayName only, never internal name
            name: p.displayName,
            // @ts-ignore - balance may not exist
            balance: Number(p.balance || 0),
            // @ts-ignore - lowBalanceAlert may not exist
            threshold: Number(p.lowBalanceAlert || 10),
            currency: p.currency || 'USD'
        }))

        return NextResponse.json({ alerts })
    } catch (error) {
        console.error('[BALANCE_CHECK] GET error:', error);
        return NextResponse.json(
            { error: "Failed to fetch alerts" },
            { status: 500 }
        )
    }
}

