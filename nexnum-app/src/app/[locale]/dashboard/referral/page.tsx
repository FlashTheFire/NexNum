'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
    Users, Copy, Check, Share2, Gift, TrendingUp,
    Twitter, MessageCircle, Send, Link2
} from 'lucide-react';

interface ReferralStats {
    referralCode: string;
    totalReferrals: number;
    totalEarnings: number;
    pendingEarnings: number;
    shareUrl: string;
    shareText: string;
    recentReferrals: Array<{
        date: string;
        amount: number;
    }>;
}

export default function ReferralPage() {
    const t = useTranslations('referral');

    const [stats, setStats] = useState<ReferralStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/user/referral');
            const data = await res.json();
            if (data.success) {
                setStats(data);
            }
        } catch (error) {
            console.error('Failed to fetch referral stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const copyCode = () => {
        if (stats?.referralCode) {
            navigator.clipboard.writeText(stats.referralCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const copyLink = () => {
        if (stats?.shareUrl) {
            navigator.clipboard.writeText(stats.shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const shareOnTwitter = () => {
        if (stats) {
            window.open(
                `https://twitter.com/intent/tweet?text=${encodeURIComponent(stats.shareText)}&url=${encodeURIComponent(stats.shareUrl)}`,
                '_blank'
            );
        }
    };

    const shareOnWhatsApp = () => {
        if (stats) {
            window.open(
                `https://wa.me/?text=${encodeURIComponent(stats.shareText + ' ' + stats.shareUrl)}`,
                '_blank'
            );
        }
    };

    const shareOnTelegram = () => {
        if (stats) {
            window.open(
                `https://t.me/share/url?url=${encodeURIComponent(stats.shareUrl)}&text=${encodeURIComponent(stats.shareText)}`,
                '_blank'
            );
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl mb-4">
                    <Users className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white">Refer & Earn</h1>
                <p className="text-gray-400 mt-2">Invite friends and earn rewards when they deposit</p>
            </div>

            {/* Referral Code Card */}
            <div className="bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 rounded-2xl p-6">
                <p className="text-purple-300 text-sm mb-2">Your Referral Code</p>
                <div className="flex items-center gap-4">
                    <code className="text-3xl font-bold font-mono text-white tracking-wider">
                        {stats?.referralCode || 'Loading...'}
                    </code>
                    <button
                        onClick={copyCode}
                        className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                    >
                        {copied ? (
                            <Check className="w-5 h-5 text-green-400" />
                        ) : (
                            <Copy className="w-5 h-5 text-white" />
                        )}
                    </button>
                </div>

                {/* Share Buttons */}
                <div className="flex flex-wrap gap-3 mt-6">
                    <button
                        onClick={copyLink}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                    >
                        <Link2 className="w-4 h-4" />
                        Copy Link
                    </button>
                    <button
                        onClick={shareOnWhatsApp}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white"
                    >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                    </button>
                    <button
                        onClick={shareOnTwitter}
                        className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 rounded-lg transition-colors text-white"
                    >
                        <Twitter className="w-4 h-4" />
                        Twitter
                    </button>
                    <button
                        onClick={shareOnTelegram}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors text-white"
                    >
                        <Send className="w-4 h-4" />
                        Telegram
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Users className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">Total Referrals</p>
                            <p className="text-2xl font-bold text-white">{stats?.totalReferrals || 0}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                            <Gift className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">Total Earnings</p>
                            <p className="text-2xl font-bold text-white">₹{stats?.totalEarnings || 0}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">Pending</p>
                            <p className="text-2xl font-bold text-white">₹{stats?.pendingEarnings || 0}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* How It Works */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">How It Works</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                            <span className="text-purple-400 font-bold">1</span>
                        </div>
                        <h3 className="text-white font-medium mb-1">Share Your Code</h3>
                        <p className="text-gray-400 text-sm">Share your unique referral code with friends</p>
                    </div>
                    <div className="text-center">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                            <span className="text-purple-400 font-bold">2</span>
                        </div>
                        <h3 className="text-white font-medium mb-1">Friend Signs Up</h3>
                        <p className="text-gray-400 text-sm">They use your code during signup or deposit</p>
                    </div>
                    <div className="text-center">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                            <span className="text-purple-400 font-bold">3</span>
                        </div>
                        <h3 className="text-white font-medium mb-1">Both Earn Rewards</h3>
                        <p className="text-gray-400 text-sm">You get ₹10 and they get 5% bonus</p>
                    </div>
                </div>
            </div>

            {/* Recent Referrals */}
            {stats?.recentReferrals && stats.recentReferrals.length > 0 && (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Recent Referrals</h2>
                    <div className="space-y-3">
                        {stats.recentReferrals.map((ref, i) => (
                            <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                                        <Check className="w-4 h-4 text-green-400" />
                                    </div>
                                    <span className="text-gray-400 text-sm">
                                        {new Date(ref.date).toLocaleDateString()}
                                    </span>
                                </div>
                                <span className="text-green-400 font-medium">+₹{ref.amount}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
