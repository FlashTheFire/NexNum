"use client"

import { memo } from 'react'

/**
 * Premium SMS Skeleton Component
 * - Staggered shimmer animations
 * - Spring pop-in effect
 * - Matches premium SMS page layout
 */
export const SMSSkeleton = memo(function SMSSkeleton() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] skeleton-shimmer" />
                    <div className="space-y-2">
                        <div className="h-6 w-32 rounded-lg bg-white/[0.06] skeleton-shimmer" />
                        <div className="h-3 w-24 rounded bg-white/[0.04] skeleton-shimmer skeleton-delay-1" />
                    </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] skeleton-shimmer skeleton-delay-2" />
            </div>

            {/* Number Card Skeleton (SIM-style) */}
            <div
                className="relative p-5 rounded-2xl bg-[#12141a]/90 border border-white/[0.04] overflow-hidden skeleton-pop-in"
                style={{
                    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)'
                }}
            >
                {/* SIM chip pattern */}
                <div className="absolute left-5 top-1/2 -translate-y-1/2 w-10 h-8 opacity-[0.08] rounded bg-white/10" />

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/[0.06] skeleton-shimmer" />
                            <div className="space-y-2">
                                <div className="h-7 w-40 rounded-lg bg-white/[0.06] skeleton-shimmer skeleton-delay-1" />
                                <div className="h-4 w-28 rounded bg-white/[0.04] skeleton-shimmer skeleton-delay-2" />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-4 py-3 rounded-xl bg-white/[0.04] flex-1 skeleton-shimmer skeleton-delay-2">
                            <div className="h-3 w-16 rounded bg-white/[0.06] mb-1" />
                            <div className="h-5 w-12 rounded bg-white/[0.08]" />
                        </div>
                        <div className="px-4 py-3 rounded-xl bg-white/[0.04] flex-1 skeleton-shimmer skeleton-delay-3">
                            <div className="h-3 w-16 rounded bg-white/[0.06] mb-1" />
                            <div className="h-5 w-8 rounded bg-white/[0.08]" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Messages Section Skeleton */}
            <div className="rounded-2xl bg-[#12141a]/50 border border-white/[0.04] p-5">
                {/* Section Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] skeleton-shimmer" />
                    <div className="h-5 w-36 rounded bg-white/[0.06] skeleton-shimmer skeleton-delay-1" />
                </div>

                {/* Message Skeletons */}
                <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className={`p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] skeleton-shimmer skeleton-delay-${i + 1}`}
                            style={{ animationDelay: `${i * 80}ms` }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-white/[0.06]" />
                                    <div className="h-4 w-24 rounded bg-white/[0.06]" />
                                </div>
                                <div className="h-3 w-16 rounded bg-white/[0.04]" />
                            </div>
                            <div className="space-y-2">
                                <div className="h-4 w-full rounded bg-white/[0.04]" />
                                <div className="h-4 w-3/4 rounded bg-white/[0.03]" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Keyframes */}
            <style jsx>{`
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                @keyframes pop-in {
                    0% { opacity: 0; transform: scale(0.95); }
                    100% { opacity: 1; transform: scale(1); }
                }
                .skeleton-shimmer {
                    background: linear-gradient(
                        90deg,
                        rgba(255,255,255,0.04) 0%,
                        rgba(255,255,255,0.08) 50%,
                        rgba(255,255,255,0.04) 100%
                    );
                    background-size: 200% 100%;
                    animation: shimmer 1.8s ease-in-out infinite;
                }
                .skeleton-pop-in {
                    animation: pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                .skeleton-delay-1 { animation-delay: 80ms; }
                .skeleton-delay-2 { animation-delay: 160ms; }
                .skeleton-delay-3 { animation-delay: 240ms; }
                
                @media (prefers-reduced-motion: reduce) {
                    .skeleton-shimmer { animation: none; }
                    .skeleton-pop-in { animation: none; opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    )
})
