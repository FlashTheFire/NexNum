import Link from 'next/link'
import { ArrowLeft, Globe, Search, CheckCircle } from 'lucide-react'

export const metadata = {
    title: 'Global Coverage & Supported Countries | NexNum Platform',
    description: 'Check real-time virtual phone number availability, supported countries, and services across NexNum global network.'
}

const COUNTRIES = [
    { code: 'US', name: 'United States', flag: '🇺🇸', services: '500+ Services', status: 'High Stock' },
    { code: 'IN', name: 'India', flag: '🇮🇳', services: '450+ Services', status: 'High Stock' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', services: '480+ Services', status: 'High Stock' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪', services: '420+ Services', status: 'Available' },
    { code: 'BR', name: 'Brazil', flag: '🇧🇷', services: '400+ Services', status: 'Available' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦', services: '450+ Services', status: 'High Stock' },
    { code: 'ID', name: 'Indonesia', flag: '🇮🇩', services: '380+ Services', status: 'Available' },
    { code: 'EG', name: 'Egypt', flag: '🇪🇬', services: '350+ Services', status: 'Available' },
]

export default function CoveragePage() {
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white py-12 px-4 md:px-8">
            <div className="max-w-5xl mx-auto space-y-8">
                <Link href="/" className="inline-flex items-center gap-2 text-xs text-white/50 hover:text-emerald-400 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to NexNum Home
                </Link>

                <div className="border-b border-white/10 pb-6 space-y-3">
                    <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight flex items-center gap-3">
                        <Globe className="h-8 w-8 text-emerald-400" /> Global Coverage
                    </h1>
                    <p className="text-sm md:text-base text-white/60">
                        Live inventory across 50+ countries and 500+ verification destinations.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {COUNTRIES.map((c) => (
                        <div key={c.code} className="bg-white/[0.02] border border-white/5 p-4 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{c.flag}</span>
                                <div>
                                    <p className="font-semibold text-sm text-white">{c.name}</p>
                                    <p className="text-xs text-white/40">{c.services}</p>
                                </div>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                {c.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
