'use client'

import React, { useMemo } from 'react'
import { Check, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface PasswordStrengthMeterProps {
    password: string
}

interface Requirement {
    label: string
    met: boolean
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
    const requirements: Requirement[] = useMemo(() => [
        { label: 'At least 6 characters', met: password.length >= 6 },
        { label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
        { label: 'At least one number', met: /\d/.test(password) },
        { label: 'At least one special character', met: /[^A-Za-z0-9]/.test(password) },
    ], [password])

    const strength = useMemo(() => {
        if (!password) return 0
        return requirements.filter(req => req.met).length
    }, [password, requirements])

    const strengthLabel = useMemo(() => {
        if (!password) return 'Very Weak'
        if (strength <= 2) return 'Weak'
        if (strength === 3) return 'Fair'
        if (strength === 4) return 'Good'
        return 'Strong'
    }, [password, strength])

    const strengthColor = useMemo(() => {
        if (!password) return 'bg-gray-700'
        if (strength <= 2) return 'bg-red-500'
        if (strength === 3) return 'bg-orange-500'
        if (strength === 4) return 'bg-yellow-500'
        return 'bg-green-500'
    }, [password, strength])

    return (
        <div className="space-y-3 mt-2">
            {/* Visual Progress Bar */}
            <div className="flex gap-1 h-1">
                {[1, 2, 3, 4, 5].map((level) => (
                    <div
                        key={level}
                        className={cn(
                            "flex-1 rounded-full transition-all duration-300",
                            level <= strength ? strengthColor : "bg-white/10"
                        )}
                    />
                ))}
            </div>

            {/* Label and Strength Text */}
            <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-bold">
                <span className="text-muted-foreground">Password Strength</span>
                <span className={cn(
                    "transition-colors duration-300",
                    password ? strengthColor.replace('bg-', 'text-') : "text-muted-foreground"
                )}>
                    {strengthLabel}
                </span>
            </div>

            {/* Detailed Requirements */}
            <div className="grid grid-cols-1 gap-1.5 pt-1">
                {requirements.map((req, idx) => (
                    <div key={idx} className="flex items-center gap-2 group">
                        <div className={cn(
                            "flex items-center justify-center w-3.5 h-3.5 rounded-full border transition-all duration-300",
                            req.met
                                ? "bg-green-500/20 border-green-500/50 text-green-500"
                                : "border-white/10 text-muted-foreground"
                        )}>
                            {req.met ? (
                                <Check className="w-2.5 h-2.5" />
                            ) : (
                                <X className="w-2.5 h-2.5 opacity-20 group-hover:opacity-100" />
                            )}
                        </div>
                        <span className={cn(
                            "text-[11px] transition-colors duration-300",
                            req.met ? "text-white" : "text-muted-foreground/60"
                        )}>
                            {req.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
