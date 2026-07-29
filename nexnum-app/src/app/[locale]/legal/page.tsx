import Link from 'next/link'
import { ArrowLeft, Shield, Scale, FileText } from 'lucide-react'

export const metadata = {
    title: 'Legal Compliance & Risk Center | NexNum',
    description: 'Overview of legal compliance, anti-fraud posture, and jurisdictional terms for NexNum Platform.'
}

export default function LegalPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white py-12 px-4 md:px-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <Link href="/" className="inline-flex items-center gap-2 text-xs text-white/50 hover:text-emerald-400 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to NexNum Home
                </Link>

                <div className="border-b border-white/10 pb-6 space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold">
                        <Scale className="h-3.5 w-3.5" /> Legal & Regulatory Standards
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Legal & Compliance Notice</h1>
                    <p className="text-sm text-white/60">Compliance Policy and Regulatory Guidelines</p>
                </div>

                <div className="space-y-6 text-sm text-white/80 leading-relaxed">
                    <section className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-3">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Shield className="h-5 w-5 text-emerald-400" /> Compliance Posture
                        </h2>
                        <p>
                            NexNum operates strictly as a technical routing proxy for temporary SMS verification. We do not provide persistent telecommunications infrastructure or personal subscriber lines.
                        </p>
                    </section>

                    <section className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-3">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <FileText className="h-5 w-5 text-purple-400" /> Applicable Links
                        </h2>
                        <div className="flex gap-4 pt-2">
                            <Link href="/privacy" className="text-emerald-400 underline">Privacy Policy</Link>
                            <Link href="/terms" className="text-emerald-400 underline">Terms of Service</Link>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
