import Link from 'next/link'
import { ArrowLeft, FileText, CheckCircle2, ShieldAlert } from 'lucide-react'

export const metadata = {
    title: 'Terms of Service | NexNum SMS Verification Platform',
    description: 'Official Terms of Service, SLA, pricing model, and usage rules for NexNum Virtual Number Platform.'
}

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white py-12 px-4 md:px-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <Link href="/" className="inline-flex items-center gap-2 text-xs text-white/50 hover:text-emerald-400 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to NexNum Home
                </Link>

                <div className="border-b border-white/10 pb-6 space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                        <FileText className="h-3.5 w-3.5" /> Terms of Service & SLA Agreement
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Terms of Service</h1>
                    <p className="text-sm text-white/60">Effective Date: July 2026</p>
                </div>

                <div className="space-y-6 text-sm text-white/80 leading-relaxed">
                    <section className="space-y-3 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" /> 1. Acceptance of Terms
                        </h2>
                        <p>
                            By creating an account, accessing the API, or utilizing any virtual phone number provided by NexNum, you agree to be bound by these Terms of Service. If you do not agree, you must cease using the platform immediately.
                        </p>
                    </section>

                    <section className="space-y-3 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" /> 2. Fair Usage & Automated Refund Guarantee
                        </h2>
                        <p>
                            NexNum operates on a pay-per-successful-SMS model. If a virtual number does not receive an SMS verification code within the active window (typically 10-20 minutes), the reservation is automatically cancelled and 100% of the reserved funds are credited back to your wallet balance.
                        </p>
                    </section>

                    <section className="space-y-3 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <ShieldAlert className="h-5 w-5 text-amber-400" /> 3. Prohibited Activities
                        </h2>
                        <p>
                            Users are strictly prohibited from using NexNum numbers for illegal activities, spamming, financial fraud, phishing, or harassment. Violations will result in immediate account termination and forfeiture of wallet funds.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
