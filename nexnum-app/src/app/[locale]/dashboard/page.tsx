"use client"

import { DesktopDashboard } from "./components/desktop-dashboard"
import { MobileDashboard } from "./components/mobile-dashboard"

export default function DashboardPage() {
    return (
        <div className="w-full h-full">
            <div className="hidden lg:block h-full">
                <DesktopDashboard />
            </div>
            <div className="lg:hidden h-full">
                <MobileDashboard />
            </div>
        </div>
    )
}
