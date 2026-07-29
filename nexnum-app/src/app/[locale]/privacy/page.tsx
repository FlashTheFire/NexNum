import Link from 'next/link'
import { ShieldCheck, ArrowLeft, Lock, FileText, CheckCircle2 } from 'lucide-react'

export const metadata = {
    title: 'Privacy Policy | NexNum SMS Verification Platform',
    description: 'Read the official NexNum Privacy Policy. Learn how we handle ephemeral data, encryption, security, and GDPR compliance.'
}

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white py-12 px-4 md:px-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Back button */}
                <Link href="/" className="inline-flex items-center gap-2 text-xs text-white/50 hover:text-emerald-400 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to NexNum Home
                </Link>

                {/* Header */}
                <div className="border-b border-white/10 pb-6 space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                        <Lock className="h-3.5 w-3.5" /> Privacy & Data Security Standard
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Privacy Policy</h1>
                    <p className="text-sm text-white/60">Last updated: July 2026 • Version 2.4</p>
                </div>

                {/* Content */}
                <div className="space-y-6 text-sm text-white/80 leading-relaxed">
                    <section className="space-y-3 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" /> 1. Ephemeral Data Architecture
                        </h2>
                        <p>
                            NexNum is engineered from the ground up as a privacy-first platform. We do not store personal phone records, private identity documents, or tracking cookies. Phone number activations and SMS messages are kept strictly ephemerally for the duration of the verification session and are automatically wiped from our cache upon completion or expiry.
                        </p>
                    </section>

                    <section className="space-y-3 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" /> 2. Information We Collect
                        </h2>
                        <p>
                            We only collect minimal technical indicators required for system operations and security:
                        </p>
                        <ul className="list-disc pl-5 space-y-1 text-white/70">
                            <li>Account authentication identifiers (email address or Telegram ID)</li>
                            <li>Wallet ledger balances and transaction reference tokens</li>
                            <li>Standard IP logs for rate limiting and DDoS prevention (purged after 7 days)</li>
                        </ul>
                    </section>

                    <section className="space-y-3 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" /> 3. Data Encryption & Storage
                        </h2>
                        <p>
                            All network communications are encrypted in transit via TLS 1.3. Sensitive tokens and provider authentication credentials are encrypted at rest using AES-256-GCM authenticated encryption.
                        </p>
                    </section>

                    <section className="space-y-3 bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" /> 4. Contact Security Officer
                        </h2>
                        <p>
                            If you have questions regarding privacy compliance or data protection requests, please reach out to our security officer at <a href="mailto:security@nx1.in" className="text-emerald-400 underline">security@nx1.in</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
