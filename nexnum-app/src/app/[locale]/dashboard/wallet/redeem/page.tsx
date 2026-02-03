'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Gift, Sparkles, Check, AlertCircle, ArrowRight, PartyPopper } from 'lucide-react';

export default function RedeemPage() {
    const t = useTranslations('wallet');

    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{
        success: boolean;
        amount?: number;
        error?: string;
    } | null>(null);

    const formatCode = (value: string) => {
        // Auto-format as NX-XXXX-XXXX
        const clean = value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (clean.length <= 2) return clean;
        if (clean.startsWith('NX')) {
            const body = clean.slice(2);
            if (body.length <= 4) return `NX-${body}`;
            return `NX-${body.slice(0, 4)}-${body.slice(4, 8)}`;
        }
        // If no NX prefix, add it
        if (clean.length <= 4) return `NX-${clean}`;
        return `NX-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim() || loading) return;

        setLoading(true);
        setResult(null);

        try {
            const res = await fetch('/api/wallet/coupon/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code.trim() }),
            });

            const data = await res.json();
            setResult(data);

            if (data.success) {
                setCode('');
            }
        } catch (error) {
            setResult({
                success: false,
                error: 'Network error. Please try again.'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl mb-4">
                        <Gift className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Redeem Gift Card</h1>
                    <p className="text-gray-400 mt-2">Enter your gift card code to add funds to your wallet</p>
                </div>

                {/* Success State */}
                {result?.success && (
                    <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-2xl p-8 text-center mb-6 animate-bounce-once">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <PartyPopper className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">
                            ₹{result.amount} Added!
                        </h2>
                        <p className="text-green-400">
                            Your wallet has been credited successfully
                        </p>
                        <button
                            onClick={() => window.location.href = '/dashboard/wallet'}
                            className="mt-6 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors flex items-center gap-2 mx-auto"
                        >
                            Go to Wallet
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Input Card */}
                {!result?.success && (
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Code Input */}
                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Gift Card Code</label>
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(formatCode(e.target.value))}
                                    placeholder="NX-XXXX-XXXX"
                                    maxLength={12}
                                    className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white text-center text-xl font-mono tracking-wider placeholder-gray-600 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                                    autoFocus
                                />
                            </div>

                            {/* Error Message */}
                            {result?.error && (
                                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    <span className="text-sm">{result.error}</span>
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={!code.trim() || loading}
                                className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Redeeming...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5" />
                                        Redeem Gift Card
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Info */}
                        <div className="mt-6 pt-4 border-t border-white/10">
                            <p className="text-gray-500 text-sm text-center">
                                Gift cards can only be redeemed once. The full value will be added to your wallet instantly.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
