"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"

// Procedural generator for vector accents
// Creates random but deterministic technical markings (crosshairs, circles, dashed lines)

interface VectorAccentProps {
    density?: "low" | "medium" | "high"
    color?: string
    className?: string
}

export const VectorAccents = ({ density = "medium", color = "rgba(255, 255, 255, 0.05)", className = "" }: VectorAccentProps) => {
    const [elements, setElements] = useState<any[]>([])

    useEffect(() => {
        // Deterministic seeding based on screen size or just random for now (client-side unique)
        const count = density === "low" ? 5 : density === "medium" ? 12 : 20
        const newElements = []

        for (let i = 0; i < count; i++) {
            const type = Math.random() > 0.6 ? 'circle' : Math.random() > 0.3 ? 'crosshair' : 'line'
            const x = Math.random() * 100
            const y = Math.random() * 100
            const size = Math.random() * 20 + 10
            const rotation = Math.random() * 360

            newElements.push({ id: i, type, x, y, size, rotation })
        }
        setElements(newElements)
    }, [density])

    return (
        <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none ${className}`}>
            {elements.map((el) => (
                <motion.div
                    key={el.id}
                    className="absolute"
                    style={{
                        left: `${el.x}%`,
                        top: `${el.y}%`,
                        width: el.size,
                        height: el.size,
                        opacity: 0.4,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: el.id * 0.1 }}
                >
                    {/* SVG Element based on type */}
                    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${el.rotation}deg)` }}>
                        {el.type === 'circle' && (
                            <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" />
                        )}
                        {el.type === 'crosshair' && (
                            <g stroke={color} strokeWidth="1.5">
                                <line x1="12" y1="2" x2="12" y2="22" />
                                <line x1="2" y1="12" x2="22" y2="12" />
                            </g>
                        )}
                        {el.type === 'line' && (
                            <line x1="0" y1="12" x2="24" y2="12" stroke={color} strokeWidth="1.5" />
                        )}
                    </svg>
                </motion.div>
            ))}
        </div>
    )
}
