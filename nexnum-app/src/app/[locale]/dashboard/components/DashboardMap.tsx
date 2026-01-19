"use client"

import { motion } from "framer-motion"
import { useTranslations } from "next-intl"

const WorldMapSvg = () => (
    <svg viewBox="0 0 1000 500" className="w-full h-full opacity-40">
        <defs>
            <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--neon-lime))" stopOpacity="0.1" />
                <stop offset="100%" stopColor="hsl(var(--neon-lime))" stopOpacity="0.3" />
            </linearGradient>
            <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>

        {/* Simplified World Map Paths - Abstract representation */}
        <g fill="url(#mapGradient)" filter="url(#glow)">
            {/* North America */}
            <path d="M150,120 Q200,80 250,100 T350,150 L300,250 Q200,280 150,200 Z" stroke="hsl(var(--neon-lime))" strokeWidth="0.5" strokeOpacity="0.3" />
            {/* South America */}
            <path d="M280,300 Q320,300 350,350 T320,450 L280,420 Z" stroke="hsl(var(--neon-lime))" strokeWidth="0.5" strokeOpacity="0.3" />
            {/* Europe & Asia */}
            <path d="M400,100 Q500,50 600,80 T800,100 L900,150 Q950,250 850,300 T700,350 L500,250 Q450,200 400,150 Z" stroke="hsl(var(--neon-lime))" strokeWidth="0.5" strokeOpacity="0.3" />
            {/* Africa */}
            <path d="M480,220 Q550,220 580,300 T550,400 L480,350 Z" stroke="hsl(var(--neon-lime))" strokeWidth="0.5" strokeOpacity="0.3" />
            {/* Australia */}
            <path d="M750,350 Q820,350 850,400 L800,420 Z" stroke="hsl(var(--neon-lime))" strokeWidth="0.5" strokeOpacity="0.3" />
        </g>

        {/* Grid Lines for Tech Effect */}
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--neon-lime))" strokeWidth="0.2" opacity="0.1" />
        </pattern>
        <rect width="1000" height="500" fill="url(#grid)" />
    </svg>
)

const ActivePoint = ({ x, y, label }: { x: number; y: number; label: string }) => (
    <div className="absolute transform -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
        <div className="relative group cursor-pointer">
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--neon-lime))] shadow-[0_0_10px_hsl(var(--neon-lime))]" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-[hsl(var(--neon-lime))] animate-ping opacity-75" />

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/90 border border-white/10 text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {label}
            </div>
        </div>
    </div>
)

export function DashboardMap() {
    const t = useTranslations('dashboard')

    return (
        <div className="relative w-full h-full overflow-hidden bg-[#0c0e12]/50 rounded-[24px]">
            <div className="absolute inset-0 flex items-center justify-center">
                <WorldMapSvg />
            </div>

            {/* Fake Active Points based on typical usage */}
            <ActivePoint x={25} y={30} label="USA (East)" />
            <ActivePoint x={20} y={35} label="USA (West)" />
            <ActivePoint x={48} y={25} label="UK/Europe" />
            <ActivePoint x={75} y={35} label="Asia (China)" />

            <div className="absolute bottom-4 left-4">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[hsl(var(--neon-lime))]" />
                    <span className="text-xs font-mono text-[hsl(var(--neon-lime))]">{t('stats.activeRegions')}: 4</span>
                </div>
            </div>
        </div>
    )
}
