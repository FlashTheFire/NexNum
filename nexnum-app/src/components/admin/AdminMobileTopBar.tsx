"use client"

import { useAuthStore } from "@/stores/authStore"
import { LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

export default function AdminMobileTopBar() {
    const { user, logout } = useAuthStore()

    return (
        <div className="fixed top-0 left-0 right-0 h-16 bg-[#0a0a0c]/90 backdrop-blur-xl border-b border-white/5 z-50 md:hidden flex items-center justify-between px-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[hsl(var(--neon-lime))] rounded-lg flex items-center justify-center shadow-[0_0_15px_hsl(var(--neon-lime)/0.4)]">
                    <span className="font-bold text-black text-sm">N</span>
                </div>
                <span className="font-bold text-white tracking-widest text-sm">NEXNUM <span className="text-[hsl(var(--neon-lime))]">ADMIN</span></span>
            </div>

            {/* User / Logout */}
            <div className="flex items-center gap-3">
                <div className="text-xs text-gray-400 font-medium">
                    {user?.name?.split(' ')[0]}
                </div>
                <button
                    onClick={() => logout()}
                    className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white"
                >
                    <LogOut size={16} />
                </button>
            </div>
        </div>
    )
}
