import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/requireAdmin'

/**
 * Export API for Admin Reports
 * GET /api/admin/export?type=transactions|users|audit
 */
export async function GET(request: Request) {
    const auth = await requireAdmin(request)
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'transactions'
    const format = searchParams.get('format') || 'csv'
    const limit = parseInt(searchParams.get('limit') || '1000')

    try {
        let data: any[] = []
        let filename = ''
        let headers: string[] = []

        switch (type) {
            case 'transactions': {
                data = await prisma.walletTransaction.findMany({
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        wallet: {
                            include: { user: { select: { email: true, name: true } } }
                        }
                    }
                })
                headers = ['ID', 'User Email', 'User Name', 'Amount', 'Type', 'Description', 'Date']
                data = data.map(t => ({
                    id: t.id,
                    email: t.wallet?.user?.email || 'N/A',
                    name: t.wallet?.user?.name || 'N/A',
                    amount: t.amount.toString(),
                    type: t.type,
                    description: t.description || '',
                    date: t.createdAt.toISOString()
                }))
                filename = `transactions_${Date.now()}`
                break
            }

            case 'users': {
                data = await prisma.user.findMany({
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        role: true,
                        isBanned: true,
                        createdAt: true,
                        wallet: { select: { id: true } }
                    }
                })
                headers = ['ID', 'Email', 'Name', 'Role', 'Status', 'Has Wallet', 'Created']
                data = data.map(u => ({
                    id: u.id,
                    email: u.email,
                    name: u.name,
                    role: u.role,
                    status: u.isBanned ? 'Banned' : 'Active',
                    hasWallet: u.wallet ? 'Yes' : 'No',
                    created: u.createdAt.toISOString()
                }))
                filename = `users_${Date.now()}`
                break
            }

            case 'audit': {
                data = await prisma.auditLog.findMany({
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: { select: { email: true } }
                    }
                })
                headers = ['ID', 'Action', 'User', 'Resource Type', 'Resource ID', 'IP', 'Date']
                data = data.map(a => ({
                    id: a.id,
                    action: a.action,
                    user: a.user?.email || 'System',
                    resourceType: a.resourceType || '',
                    resourceId: a.resourceId || '',
                    ip: a.ipAddress || '',
                    date: a.createdAt.toISOString()
                }))
                filename = `audit_logs_${Date.now()}`
                break
            }

            case 'providers': {
                data = await prisma.provider.findMany({
                    select: {
                        id: true,
                        name: true,
                        displayName: true,
                        isActive: true,
                        priority: true,
                        balance: true,
                        createdAt: true,
                        _count: { select: { syncJobs: true } }
                    }
                })
                headers = ['ID', 'Name', 'Display Name', 'Active', 'Priority', 'Balance', 'Sync Jobs', 'Created']
                data = data.map(p => ({
                    id: p.id,
                    name: p.name,
                    displayName: p.displayName,
                    active: p.isActive ? 'Yes' : 'No',
                    priority: p.priority.toString(),
                    balance: p.balance.toString(),
                    syncJobs: p._count.syncJobs.toString(),
                    created: p.createdAt.toISOString()
                }))
                filename = `providers_${Date.now()}`
                break
            }

            default:
                return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
        }

        if (format === 'json') {
            return NextResponse.json(data, {
                headers: {
                    'Content-Disposition': `attachment; filename="${filename}.json"`,
                    'Content-Type': 'application/json',
                }
            })
        }

        // CSV format
        const csv = generateCSV(headers, data)
        return new NextResponse(csv, {
            headers: {
                'Content-Disposition': `attachment; filename="${filename}.csv"`,
                'Content-Type': 'text/csv',
            }
        })

    } catch (error) {
        console.error('Export error:', error)
        return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }
}

function generateCSV(headers: string[], data: any[]): string {
    const escapeCSV = (value: any): string => {
        const str = String(value || '')
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
        }
        return str
    }

    const headerRow = headers.map(escapeCSV).join(',')
    const dataRows = data.map(row =>
        Object.values(row).map(escapeCSV).join(',')
    )

    return [headerRow, ...dataRows].join('\n')
}
