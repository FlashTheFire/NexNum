'use client'

import React, { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface OTPInputProps {
    length?: number
    onChange: (otp: string) => void
    disabled?: boolean
}

export function OTPInput({ length = 6, onChange, disabled }: OTPInputProps) {
    const [otp, setOtp] = useState<string[]>(new Array(length).fill(''))
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const { value } = e.target
        if (isNaN(Number(value))) return

        const newOtp = [...otp]
        newOtp[index] = value.substring(value.length - 1)
        setOtp(newOtp)
        onChange(newOtp.join(''))

        // Move to next input
        if (value && index < length - 1) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const data = e.clipboardData.getData('text').replace(/[^0-9]/g, '').substring(0, length)
        if (data) {
            const newOtp = data.split('')
            const paddedOtp = [...newOtp, ...new Array(length - newOtp.length).fill('')]
            setOtp(paddedOtp)
            onChange(paddedOtp.join(''))
            inputRefs.current[Math.min(data.length, length - 1)]?.focus()
        }
    }

    return (
        <div className="flex justify-center gap-2 sm:gap-4 py-4">
            {otp.map((digit, index) => (
                <div key={index} className="relative group">
                    <input
                        ref={(el) => { inputRefs.current[index] = el }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="\d{1}"
                        value={digit}
                        onChange={(e) => handleChange(e, index)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        onPaste={handlePaste}
                        disabled={disabled}
                        className={cn(
                            "w-10 h-14 sm:w-12 sm:h-16 text-center text-2xl font-bold bg-secondary/20 border-2 rounded-xl text-white transition-all duration-200 focus:outline-none",
                            digit
                                ? "border-neon-lime/50 shadow-[0_0_15px_rgba(157,255,0,0.15)]"
                                : "border-white/10 hover:border-white/20",
                            "focus:border-neon-lime focus:bg-secondary/40 focus:scale-105"
                        )}
                    />
                    {/* Visual caret-like bottom bar */}
                    <motion.div
                        initial={false}
                        animate={digit ? { opacity: 0 } : { opacity: 1 }}
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-white/20 rounded-full group-focus-within:bg-neon-lime group-focus-within:opacity-100"
                    />
                </div>
            ))}
        </div>
    )
}
