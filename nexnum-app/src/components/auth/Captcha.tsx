
"use client"

import { useEffect, useRef, useState } from "react"
import HCaptcha from "@hcaptcha/react-hcaptcha"

interface CaptchaProps {
    onVerify: (token: string) => void
}

export function Captcha({ onVerify }: CaptchaProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return <div className="h-[78px] w-full bg-secondary/20 rounded animate-pulse" />

    return (
        <div className="flex justify-center my-4">
            <HCaptcha
                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || "10000000-ffff-ffff-ffff-000000000001"}
                onVerify={onVerify}
                theme="dark"
            />
        </div>
    )
}
