
import { NextResponse } from "next/server"
import { prisma } from "@/lib/core/db"
import { getProviderAdapter, hasDynamicConfig } from "@/lib/providers/provider-factory"
import { DynamicProvider } from "@/lib/providers/dynamic-provider"
import { requireAdmin } from "@/lib/auth/requireAdmin"

// POST /api/admin/providers/balance-check
// Trigger sync for all active providers
export async function POST(request: Request) {
    // Require admin authentication
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const providers = await prisma.provider.findMany({
            where: { isActive: true }
        })

        const results = await Promise.all(providers.map(async (p) => {
            try {
                const engine = getProviderAdapter(p)
                const isDynamic = hasDynamicConfig(p)

                let balance: number
                if (isDynamic) {
                    // DynamicProvider has syncBalance which also updates DB
                    balance = await (engine as DynamicProvider).syncBalance()
                } else {
                    // Legacy providers just have getBalance
                    balance = await engine.getBalance?.() ?? 0
                }

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
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    try {
        const lowBalanceProviders = await prisma.provider.findMany({
            where: {
                isActive: true,
            }
        })

        // Filter in memory for balance < threshold
        const alerts = lowBalanceProviders.filter(p => {
            const bal = Number(p.balance || 0)
            const thresh = Number(p.lowBalanceAlert || 10)
            return bal < thresh
        }).map(p => ({
            id: p.id,
            // Use displayName only, never internal name
            name: p.displayName,
            balance: Number(p.balance),
            threshold: Number(p.lowBalanceAlert),
            currency: p.currency
        }))

        return NextResponse.json({ alerts })
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to fetch alerts" },
            { status: 500 }
        )
    }
}
