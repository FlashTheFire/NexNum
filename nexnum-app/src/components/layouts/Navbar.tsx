
"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Bell, User } from "lucide-react"

export function Navbar() {
    return (
        <div className="border-b bg-background/50 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-50">
            <div className="md:hidden">
                {/* Mobile Menu Trigger Placeholder */}
                <Button variant="ghost" size="icon">
                    <span className="sr-only">Menu</span>
                    <svg
                        className="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </Button>
            </div>

            <div className="hidden md:flex items-center w-1/3">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search services (WhatsApp, Telegram...)"
                        className="pl-9 bg-secondary/50 border-none focus-visible:ring-primary/20"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-neon-lime animate-pulse"></span>
                </Button>
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-teal-mid p-[1px]">
                    <div className="h-full w-full rounded-full bg-background flex items-center justify-center">
                        <User className="h-4 w-4 text-foreground" />
                    </div>
                </div>
            </div>
        </div>
    )
}
