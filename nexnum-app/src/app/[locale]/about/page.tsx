import Link from 'next/link'
import { ArrowLeft, Cpu, Globe2, ShieldCheck, Zap } from 'lucide-react'

export const metadata = {
    title: 'About NexNum | Next-Gen Global SMS Infrastructure',
    description: 'Learn about NexNum platform architecture, multi-provider active routing, zero-latency state machine, and global coverage.'
}

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white py-12 px-4 md:px-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <Link href="/" className="inline-flex items-center gap-2 text-xs text-white/50 hover:text-emerald-400 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to NexNum Home
                </Link>

                <div className="border-b border-white/10 pb-6 space-y-3">
                    <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
                        About <span className="text-emerald-400">NexNum</span>
                    </h1>
                    <p className="text-sm md:text-base text-white/60">
                        High-throughput infrastructure for virtual phone numbers and automated SMS verification.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-2">
                        <Zap className="h-8 w-8 text-emerald-400" />
                        <h3 className="text-lg font-bold text-white">Ultra-Low Latency Routing</h3>
                        <p className="text-xs text-white/60">
                            Our active order stream engine polls provider pools every 3 seconds to deliver verification codes under 200ms of arrival.
                        </p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-2">
                        <Globe2 className="h-8 w-8 text-cyan-400" />
                        <h3 className="text-lg font-bold text-white">50+ Countries Coverage</h3>
                        <p className="text-xs text-white/60">
                            Connect to international mobile carrier stocks across US, Europe, Asia, Latin America, and Africa instantly.
                        </p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-2">
                        <Cpu className="h-8 w-8 text-purple-400" />
                        <h3 className="text-lg font-bold text-white">500+ Verification Services</h3>
                        <p className="text-xs text-white/60">
                            Pre-configured routes for WhatsApp, Telegram, Discord, Google, ChatGPT, Claude, Instagram, and major global platforms.
                        </p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-2">
                        <ShieldCheck className="h-8 w-8 text-amber-400" />
                        <h3 className="text-lg font-bold text-white">Zero Financial Risk</h3>
                        <p className="text-xs text-white/60">
                            Atomic reservation-commit protocol ensures funds are only deducted when a valid verification code is successfully received.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
