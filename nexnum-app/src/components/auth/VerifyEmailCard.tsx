"use client";

import { motion } from "framer-motion";
import { ReactNode, memo } from "react";

interface VerifyEmailCardProps {
    children: ReactNode;
    className?: string;
}

const VerifyEmailCardComponent = ({ children, className = "" }: VerifyEmailCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={`relative ${className}`}
        >
            {/* Outer neon lime glow - premium effect */}
            <div
                className="absolute -inset-1 rounded-[2rem] opacity-60"
                style={{
                    background: "linear-gradient(135deg, hsl(75,100%,50%,0.15) 0%, transparent 50%, hsl(180,50%,30%,0.1) 100%)",
                    filter: "blur(25px)",
                }}
            />

            {/* Card container with enhanced glass effect */}
            <div
                className="relative rounded-3xl overflow-hidden border-2"
                style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    borderColor: "hsl(75,100%,50%, 0.3)",
                    boxShadow: `
                        0 0 30px rgba(188,255,0,0.15),
                        0 25px 50px -12px rgba(0,0,0,0.6),
                        0 0 0 1px rgba(255,255,255,0.05) inset,
                        0 1px 0 rgba(255,255,255,0.1) inset
                    `,
                }}
            >
                {/* Top neon highlight */}
                <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{
                        background: "linear-gradient(90deg, transparent, rgba(188,255,0,0.3), transparent)",
                    }}
                />

                {/* Content */}
                <div className="relative p-8 md:p-10 lg:p-12">
                    {children}
                </div>

                {/* Bottom neon rim light */}
                <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px"
                    style={{
                        background: "linear-gradient(90deg, transparent, hsl(75,100%,50%,0.4), transparent)",
                    }}
                />
            </div>
        </motion.div>
    );
};

export default memo(VerifyEmailCardComponent);
