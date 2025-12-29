"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface AuthCardProps {
    children: ReactNode;
    className?: string;
}

export default function AuthCard({ children, className = "" }: AuthCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={`relative ${className}`}
        >
            {/* Outer glow */}
            <div
                className="absolute -inset-1 rounded-[2rem] opacity-50"
                style={{
                    background: "linear-gradient(135deg, hsl(75,100%,50%,0.1) 0%, transparent 50%, hsl(180,50%,30%,0.1) 100%)",
                    filter: "blur(20px)",
                }}
            />

            {/* Card */}
            <div
                className="relative rounded-3xl overflow-hidden"
                style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: `
                        0 25px 50px -12px rgba(0,0,0,0.5),
                        0 0 0 1px rgba(255,255,255,0.05) inset,
                        0 1px 0 rgba(255,255,255,0.1) inset
                    `,
                }}
            >
                {/* Top highlight */}
                <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
                    }}
                />

                {/* Content */}
                <div className="relative p-8 md:p-10">
                    {children}
                </div>

                {/* Neon rim light - subtle */}
                <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px"
                    style={{
                        background: "linear-gradient(90deg, transparent, hsl(75,100%,50%,0.3), transparent)",
                    }}
                />
            </div>
        </motion.div>
    );
}
