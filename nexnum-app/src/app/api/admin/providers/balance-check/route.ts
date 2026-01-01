
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { DynamicProvider } from "@/lib/dynamic-provider"

// POST /api/admin/providers/balance-check
// Trigger sync for all active providers
export async function POST() {
    try {
        const providers = await prisma.provider.findMany({
            where: { isActive: true }
        })

        const results = await Promise.all(providers.map(async (p) => {
            try {
                const engine = new DynamicProvider(p)
                const balance = await engine.syncBalance()
                return {
                    provider: p.name,
                    balance,
                    status: 'success'
                }
            } catch (e) {
                return {
                    provider: p.name,
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
export async function GET() {
    try {
        const lowBalanceProviders = await prisma.provider.findMany({
            where: {
                isActive: true,
                // We want providers where balance < lowBalanceAlert
                // Prisma doesn't support field comparison directly in where clause easily without raw query or logic here
            }
        })

        // Filter in memory for simplicity unless we use raw query
        // "balance" and "lowBalanceAlert" are Decimals
        const alerts = lowBalanceProviders.filter(p => {
            // Ensure we have numbers to compare
            const bal = Number(p.balance || 0)
            const thresh = Number(p.lowBalanceAlert || 10)
            return bal < thresh
        }).map(p => ({
            id: p.id,
            name: p.displayName || p.name,
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
