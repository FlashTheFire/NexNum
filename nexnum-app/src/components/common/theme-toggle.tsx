"use client"

import * as React from "react"
import { Moon, Sun, Sparkles } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
    const [theme, setTheme] = React.useState<"light" | "dark">("dark")
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
        const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null
        if (savedTheme) {
            setTheme(savedTheme)
            document.documentElement.classList.toggle("dark", savedTheme === "dark")
        } else {
            const isDark = document.documentElement.classList.contains("dark")
            setTheme(isDark ? "dark" : "light")
        }
    }, [])

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light"
        setTheme(newTheme)
        localStorage.setItem("theme", newTheme)
        document.documentElement.classList.toggle("dark", newTheme === "dark")
    }

    if (!mounted) {
        return (
            <div className="w-16 h-8 rounded-full bg-muted/50 animate-pulse" />
        )
    }

    const isDark = theme === "dark"

    return (
        <motion.button
            onClick={toggleTheme}
            className={cn(
                "relative w-16 h-8 rounded-full p-1 transition-colors duration-500",
                isDark
                    ? "bg-gradient-to-r from-slate-800 to-slate-900 shadow-inner"
                    : "bg-gradient-to-r from-sky-400 to-blue-500",
                "border border-white/10 shadow-lg",
                className
            )}
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle theme"
        >
            {/* Stars for dark mode */}
            <AnimatePresence>
                {isDark && (
                    <>
                        <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ delay: 0.1 }}
                            className="absolute top-1.5 left-3 w-1 h-1 bg-white rounded-full"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ delay: 0.2 }}
                            className="absolute top-2.5 left-6 w-0.5 h-0.5 bg-white/70 rounded-full"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ delay: 0.15 }}
                            className="absolute bottom-2 left-4 w-0.5 h-0.5 bg-white/50 rounded-full"
                        />
                    </>
                )}
            </AnimatePresence>

            {/* Clouds for light mode */}
            <AnimatePresence>
                {!isDark && (
                    <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 0.6, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                        <div className="flex gap-0.5">
                            <div className="w-2 h-2 bg-white rounded-full" />
                            <div className="w-3 h-3 bg-white rounded-full -mt-0.5" />
                            <div className="w-2 h-2 bg-white rounded-full" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toggle Knob with Sun/Moon */}
            <motion.div
                className={cn(
                    "relative w-6 h-6 rounded-full flex items-center justify-center shadow-lg",
                    isDark
                        ? "bg-gradient-to-br from-slate-200 to-slate-400"
                        : "bg-gradient-to-br from-amber-300 to-yellow-500"
                )}
                animate={{
                    x: isDark ? 0 : 32,
                }}
                transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 30
                }}
            >
                <AnimatePresence mode="wait">
                    {isDark ? (
                        <motion.div
                            key="moon"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Moon className="h-3.5 w-3.5 text-slate-700" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="sun"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Sun className="h-3.5 w-3.5 text-amber-700" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.button>
    )
}

// Compact icon-only version for tight spaces
export function ThemeToggleIcon({ className }: { className?: string }) {
    const [theme, setTheme] = React.useState<"light" | "dark">("dark")
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
        const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null
        if (savedTheme) {
            setTheme(savedTheme)
        } else {
            const isDark = document.documentElement.classList.contains("dark")
            setTheme(isDark ? "dark" : "light")
        }
    }, [])

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light"
        setTheme(newTheme)
        localStorage.setItem("theme", newTheme)
        document.documentElement.classList.toggle("dark", newTheme === "dark")
    }

    if (!mounted) return null

    return (
        <motion.button
            onClick={toggleTheme}
            className={cn(
                "relative h-9 w-9 rounded-xl flex items-center justify-center",
                "bg-white/5 border border-white/10 backdrop-blur-xl",
                "hover:bg-white/10 transition-colors",
                className
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle theme"
        >
            <AnimatePresence mode="wait">
                {theme === "dark" ? (
                    <motion.div
                        key="moon"
                        initial={{ rotate: -90, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        exit={{ rotate: 90, scale: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        <Moon className="h-4 w-4 text-indigo-300" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="sun"
                        initial={{ rotate: 90, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        exit={{ rotate: -90, scale: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        <Sun className="h-4 w-4 text-amber-400" />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    )
}
