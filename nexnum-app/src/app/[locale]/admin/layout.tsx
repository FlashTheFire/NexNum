import { Metadata } from 'next'
import { AdminLoadingGuard } from '@/components/admin/AdminLoadingGuard'
import { AdminClientLayout } from '@/components/admin/AdminClientLayout'
import { notFound } from 'next/navigation'
import { AuthGuard } from '@/lib/auth/guard'
import { setRequestLocale } from 'next-intl/server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Admin Panel | NexNum',
    description: 'System Administration',
}

export default async function AdminLayout({
    children,
    params
}: {
    children: React.ReactNode
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params;
    setRequestLocale(locale);

    // SECURITY: Server-side RBAC check
    // If not admin, return 404 to hide the path entirely
    const user = await AuthGuard.tryUser()
    if (!user || user.role !== 'ADMIN') {
        notFound()
    }

    return (
        <AdminLoadingGuard>
            <AdminClientLayout>
                {children}
            </AdminClientLayout>
        </AdminLoadingGuard>
    )
}
