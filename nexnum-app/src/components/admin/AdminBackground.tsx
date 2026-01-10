"use client"

import { VectorAccents } from "./VectorAccents"

export const AdminBackground = () => {
    return (
        <div className="fixed inset-0 z-0 bg-[#0A0A0C] text-white overflow-hidden pointer-events-none">
            {/* 1. Base Gradient: Dark Charcoal to Deep Teal/Slate hint */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0c] via-[#0f1115] to-[#0c0e11]" />

            {/* 2. Soft Neon-Lime Halo (Top-Right) */}
            <div className="absolute -top-[20%] -right-[10%] w-[80vw] h-[80vw] rounded-full bg-[radial-gradient(circle,rgba(204,255,0,0.03)_0%,transparent_70%)] blur-3xl opacity-60" />

            {/* 3. Secondary Halo (Bottom-Left) - Isometric depth */}
            <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.02)_0%,transparent_70%)] blur-3xl opacity-40" />

            {/* 4. Micro-Noise Texture (CSS-based film grain) */}
            <div
                className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* 5. Isometric Grid Lines (Very faint) */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:100px_100px] opacity-20" />

            {/* 6. Vector Accents (Dynamic technical markings) */}
            <VectorAccents density="medium" color="rgba(255, 255, 255, 0.03)" />

            {/* 7. Vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
        </div>
    )
}
