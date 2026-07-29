import Link from 'next/link'
import { ArrowLeft, Mail, MessageSquare, Send } from 'lucide-react'

export const metadata = {
    title: 'Contact Support | NexNum SMS Platform',
    description: 'Get support, report issues, or contact NexNum technical operations team.'
}

export default function ContactPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white py-12 px-4 md:px-8">
            <div className="max-w-3xl mx-auto space-y-8">
                <Link href="/" className="inline-flex items-center gap-2 text-xs text-white/50 hover:text-emerald-400 transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to NexNum Home
                </Link>

                <div className="border-b border-white/10 pb-6 space-y-3">
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Contact Support</h1>
                    <p className="text-sm text-white/60">Our technical support team is available 24/7 to assist with integrations and accounts.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a href="mailto:support@nx1.in" className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl flex items-center gap-4 hover:border-emerald-500/40 transition-colors group">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                            <Mail className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="font-bold text-sm text-white group-hover:text-emerald-400">Email Support</p>
                            <p className="text-xs text-white/50">support@nx1.in</p>
                        </div>
                    </a>

                    <a href="https://t.me/nexnum_support" target="_blank" rel="noreferrer" className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl flex items-center gap-4 hover:border-cyan-500/40 transition-colors group">
                        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                            <MessageSquare className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="font-bold text-sm text-white group-hover:text-cyan-400">Telegram Support</p>
                            <p className="text-xs text-white/50">@nexnum_support</p>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    )
}
