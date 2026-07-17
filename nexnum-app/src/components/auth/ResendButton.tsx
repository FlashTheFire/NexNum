"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface ResendButtonProps {
    onClick: () => void;
    isLoading?: boolean;
    cooldownDuration?: number;
    disabled?: boolean;
    className?: string;
}

export default function ResendButton({
    onClick,
    isLoading = false,
    cooldownDuration = 60,
    disabled = false,
    className = "",
}: ResendButtonProps) {
    const [cooldown, setCooldown] = useState(0);

    // Cooldown timer effect
    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    const handleClick = () => {
        onClick();
        setCooldown(cooldownDuration);
    };

    const isDisabled = disabled || isLoading || cooldown > 0;

    return (
        <motion.div
            whileHover={isDisabled ? {} : { scale: 1.02 }}
            whileTap={isDisabled ? {} : { scale: 0.98 }}
        >
            <Button
                variant="neon"
                className={`w-full h-12 text-base ${className}`}
                onClick={handleClick}
                disabled={isDisabled}
            >
                {isLoading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                    </>
                ) : cooldown > 0 ? (
                    <>
                        <motion.div
                            key={cooldown}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.2 }}
                        >
                            Resend in {cooldown}s
                        </motion.div>
                    </>
                ) : (
                    <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Resend Verification Email
                    </>
                )}
            </Button>
        </motion.div>
    );
}
