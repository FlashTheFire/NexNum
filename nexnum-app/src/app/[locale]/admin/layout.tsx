import { Metadata } from 'next'
import { AdminLoadingGuard } from '@/components/admin/AdminLoadingGuard'
import { AdminClientLayout } from '@/components/admin/AdminClientLayout'
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

    return (
        <AdminLoadingGuard>
            <AdminClientLayout>
                {children}
            </AdminClientLayout>
        </AdminLoadingGuard>
    )
}
