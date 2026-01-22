"use client"

import { SidebarProvider, useSidebar } from '@/components/admin/SidebarContext'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import AdminMobileTopBar from '@/components/admin/AdminMobileTopBar'
import AdminMobileActionBar from '@/components/admin/AdminMobileActionBar'
import { AdminBackground } from '@/components/admin/AdminBackground'
import { LowBalanceAlert } from '@/components/admin/LowBalanceAlert'
import { AdminNavigationLogger } from '@/components/admin/AdminNavigationLogger'

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
    const { isCollapsed } = useSidebar()

    return (
        <div className="relative min-h-screen font-sans selection:bg-[hsl(var(--neon-lime))] selection:text-black flex flex-col md:flex-row">
            <AdminBackground />
            <AdminSidebar />
            <AdminMobileTopBar />

            {/* Main Content Area */}
            <div
                className={`relative flex-1 transition-all duration-300 pt-16 md:pt-0 ${isCollapsed ? 'md:pl-20' : 'md:pl-64'
                    }`}
            >
                <LowBalanceAlert />
                <AdminNavigationLogger />
                {children}
            </div>

            <AdminMobileActionBar />
        </div>
    )
}

export function AdminClientLayout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <AdminLayoutContent>
                {children}
            </AdminLayoutContent>
        </SidebarProvider>
    )
}
