import { Metadata } from 'next'
import { AdminBackground } from '@/components/admin/AdminBackground'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import AdminMobileActionBar from '@/components/admin/AdminMobileActionBar'

import AdminMobileTopBar from '@/components/admin/AdminMobileTopBar'
import { LowBalanceAlert } from '@/components/admin/LowBalanceAlert'

import { AdminLoadingGuard } from '@/components/admin/AdminLoadingGuard'
import { setRequestLocale } from 'next-intl/server'

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
            <div className="relative min-h-screen font-sans selection:bg-[hsl(var(--neon-lime))] selection:text-black flex flex-col md:flex-row">
                <AdminBackground />
                <AdminSidebar />
                <AdminMobileTopBar />

                {/* Main Content Area - removed z-10 to fix sheet stacking */}
                <div className="relative flex-1 md:pl-20 lg:pl-64 transition-all duration-300 pt-16 md:pt-0">
                    <LowBalanceAlert />
                    {children}
                </div>

                <AdminMobileActionBar />
            </div>
        </AdminLoadingGuard>
    )
}
