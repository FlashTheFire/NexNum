"use client"

import { TechnicalHUD } from "@/components/ui/technical-hud"

export default function MaintenanceBackground() {
    return (
        <div className="fixed inset-0 w-full h-full bg-[#030305] flex items-center justify-center overflow-hidden">
            {/* Absolute Black Canvas */}
            <div className="absolute inset-0 bg-[#030305]" />

            {/* Only show on desktop per request, or just show it always since it's a dedicated page? 
                 User said "in desktop", implies desktop view. I'll just render it full screen. 
             */}
            <TechnicalHUD />
        </div>
    )
}
