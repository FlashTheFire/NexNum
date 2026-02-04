'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Ticket, Gift, Users, TrendingUp, Plus, Download,
    Search, MoreVertical, Copy, Check, X,
    Calendar, Percent, DollarSign, BarChart3, RefreshCw,
    Eye, Edit3, Trash2, AlertTriangle, Clock, Sparkles,
    ChevronDown, Filter, ArrowUpRight, XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { PremiumSkeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api/api-client"

// ============================================================================
// Types
// ============================================================================

interface Coupon {
    id: string;
    code: string;
    type: 'PROMO' | 'GIFT' | 'REFERRAL';
    status: 'ACTIVE' | 'EXPIRED' | 'DEPLETED' | 'DISABLED';
    discountType?: string;
    discountValue?: number;
    giftAmount?: number;
    maxUses: number;
    currentUses: number;
    expiresAt?: string;
    name?: string;
    description?: string;
    maxDiscount?: number;
    minDepositAmount?: number;
    maxUsesPerUser?: number;
    newUsersOnly?: boolean;
    createdAt: string;
    _count?: { redemptions: number };
}

interface Analytics {
    totalCoupons: number;
    activeCoupons: number;
    totalRedemptions: number;
    totalDiscountGiven: number;
    topCoupons: Array<{
        code: string;
        type: string;
        redemptions: number;
        totalValue: number;
    }>;
}

// ============================================================================
// Components
// ============================================================================

function GlassCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={`bg-[#0A0A0A] border border-white/5 rounded-2xl relative overflow-hidden backdrop-blur-3xl ${className}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            {children}
        </div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    trend,
    color = 'purple'
}: {
    icon: any;
    label: string;
    value: string | number;
    trend?: string;
    color?: 'purple' | 'green' | 'blue' | 'amber' | 'red';
}) {
    const colors = {
        purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', accent: 'text-purple-500/50' },
        green: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', accent: 'text-emerald-500/50' },
        blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', accent: 'text-blue-500/50' },
        amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', accent: 'text-amber-500/50' },
        red: { bg: 'bg-red-500/10', text: 'text-red-400', accent: 'text-red-500/50' },
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
        >
            <GlassCard className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div className={`p-2.5 rounded-xl ${colors[color].bg}`}>
                        <Icon className={`w-5 h-5 ${colors[color].text}`} />
                    </div>
                    <div className={`text-[10px] font-bold uppercase tracking-widest ${colors[color].accent}`}>
                        {label.split(' ')[0]}
                    </div>
                </div>
                <h3 className="text-sm font-medium text-white/50 mb-1">{label}</h3>
                <div className="flex items-end justify-between">
                    <span className="text-2xl font-bold text-white tracking-tight">{value}</span>
                    {trend && (
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3" /> {trend}
                        </span>
                    )}
                </div>
            </GlassCard>
        </motion.div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export default function CouponsPage() {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'promo' | 'gift' | 'referral'>('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Create form state
    const [createForm, setCreateForm] = useState({
        type: 'PROMO' as 'PROMO' | 'GIFT',
        name: '',
        description: '',
        discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
        discountValue: '',
        giftAmount: '',
        maxDiscount: '',
        maxUses: '0',
        maxUsesPerUser: '1',
        minDepositAmount: '',
        newUsersOnly: false,
        expiresAt: '',
    });

    // Edit form state
    const [editForm, setEditForm] = useState({
        name: '',
        description: '',
        discountValue: '',
        maxUses: '',
        maxUsesPerUser: '',
        expiresAt: '',
    });

    // Batch form state
    const [batchForm, setBatchForm] = useState({
        count: '10',
        amount: '100',
        expiresAt: '',
        name: '',
    });

    const [saving, setSaving] = useState(false);

    const fetchCoupons = useCallback(async () => {
        try {
            const typeFilter = activeTab !== 'all' ? `&type=${activeTab.toUpperCase()}` : '';
            const searchFilter = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
            const result = await api.request<any>(`/api/admin/coupons?limit=100${typeFilter}${searchFilter}`);
            if (result.success && result.data) {
                setCoupons(result.data.coupons);
            }
        } catch (error) {
            console.error('Failed to fetch coupons:', error);
            toast.error('Failed to fetch coupons');
        }
    }, [activeTab, searchQuery]);

    const fetchAnalytics = useCallback(async () => {
        try {
            const result = await api.request<any>('/api/admin/coupons/analytics?days=30');
            if (result.success && result.data) {
                setAnalytics(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        }
    }, []);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([fetchCoupons(), fetchAnalytics()]);
            setLoading(false);
        };
        loadData();
    }, [fetchCoupons, fetchAnalytics]);

    const handleCreateCoupon = async () => {
        setSaving(true);
        try {
            const payload: any = {
                type: createForm.type,
                name: createForm.name || undefined,
                description: createForm.description || undefined,
                maxUses: parseInt(createForm.maxUses) || 0,
                maxUsesPerUser: parseInt(createForm.maxUsesPerUser) || 1,
                newUsersOnly: createForm.newUsersOnly,
                expiresAt: createForm.expiresAt || undefined,
            };

            if (createForm.type === 'PROMO') {
                payload.discountType = createForm.discountType;
                payload.discountValue = parseFloat(createForm.discountValue) || 0;
                if (createForm.maxDiscount) {
                    payload.maxDiscount = parseFloat(createForm.maxDiscount);
                }
                if (createForm.minDepositAmount) {
                    payload.minDepositAmount = parseFloat(createForm.minDepositAmount);
                }
            } else {
                payload.giftAmount = parseFloat(createForm.giftAmount) || 0;
            }

            const result = await api.request<any>('/api/admin/coupons', 'POST', payload);

            if (result.success) {
                toast.success('Coupon created successfully!');
                setShowCreateModal(false);
                resetCreateForm();
                fetchCoupons();
                fetchAnalytics();
            } else {
                toast.error(result.error || 'Failed to create coupon');
            }
        } catch (error) {
            console.error('Create coupon error:', error);
            toast.error('Failed to create coupon');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateCoupon = async () => {
        if (!editingCoupon) return;
        setSaving(true);
        try {
            const result = await api.request<any>(`/api/admin/coupons?id=${editingCoupon.id}`, 'PATCH', {
                name: editForm.name || undefined,
                description: editForm.description || undefined,
                discountValue: editForm.discountValue ? parseFloat(editForm.discountValue) : undefined,
                maxUses: editForm.maxUses ? parseInt(editForm.maxUses) : undefined,
                maxUsesPerUser: editForm.maxUsesPerUser ? parseInt(editForm.maxUsesPerUser) : undefined,
                expiresAt: editForm.expiresAt || undefined,
            });

            if (result.success) {
                toast.success('Coupon updated successfully!');
                setShowEditModal(false);
                setEditingCoupon(null);
                fetchCoupons();
            } else {
                toast.error(result.error || 'Failed to update coupon');
            }
        } catch (error) {
            console.error('Update coupon error:', error);
            toast.error('Failed to update coupon');
        } finally {
            setSaving(false);
        }
    };

    const handleBatchGenerate = async () => {
        setSaving(true);
        try {
            const result = await api.request<any>('/api/admin/coupons/batch', 'POST', {
                count: parseInt(batchForm.count),
                amount: parseFloat(batchForm.amount),
                expiresAt: batchForm.expiresAt || undefined,
                name: batchForm.name || undefined,
            });

            if (result.success && result.data) {
                // Download CSV
                const blob = new Blob([result.data.csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `gift-cards-${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                URL.revokeObjectURL(url);

                toast.success(`${batchForm.count} gift cards generated successfully!`);
                setShowBatchModal(false);
                setBatchForm({ count: '10', amount: '100', expiresAt: '', name: '' });
                fetchCoupons();
                fetchAnalytics();
            } else {
                toast.error(result.error || 'Failed to generate gift cards');
            }
        } catch (error) {
            console.error('Batch generate error:', error);
            toast.error('Failed to generate gift cards');
        } finally {
            setSaving(false);
        }
    };

    const handleDisableCoupon = async (id: string, code: string) => {
        try {
            const result = await api.request<any>(`/api/admin/coupons?id=${id}`, 'DELETE');
            if (result.success) {
                toast.success(`Coupon ${code} disabled`);
                fetchCoupons();
                fetchAnalytics();
            } else {
                toast.error(result.error || 'Failed to disable coupon');
            }
        } catch (error) {
            console.error('Disable coupon error:', error);
            toast.error('Failed to disable coupon');
        }
    };

    const openEditModal = (coupon: Coupon) => {
        setEditingCoupon(coupon);
        setEditForm({
            name: coupon.name || '',
            description: coupon.description || '',
            discountValue: coupon.discountValue?.toString() || coupon.giftAmount?.toString() || '',
            maxUses: coupon.maxUses.toString(),
            maxUsesPerUser: coupon.maxUsesPerUser?.toString() || '1',
            expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 16) : '',
        });
        setShowEditModal(true);
    };

    const resetCreateForm = () => {
        setCreateForm({
            type: 'PROMO',
            name: '',
            description: '',
            discountType: 'PERCENTAGE',
            discountValue: '',
            giftAmount: '',
            maxDiscount: '',
            maxUses: '0',
            maxUsesPerUser: '1',
            minDepositAmount: '',
            newUsersOnly: false,
            expiresAt: '',
        });
    };

    const copyToClipboard = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        toast.success('Code copied to clipboard');
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const getTypeConfig = (type: string) => {
        switch (type) {
            case 'PROMO':
                return { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', icon: Percent };
            case 'GIFT':
                return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', icon: Gift };
            case 'REFERRAL':
                return { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', icon: Users };
            default:
                return { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30', icon: Ticket };
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'ACTIVE':
                return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-500' };
            case 'EXPIRED':
                return { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-500' };
            case 'DEPLETED':
                return { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-500' };
            case 'DISABLED':
                return { bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-500' };
            default:
                return { bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-500' };
        }
    };

    const formatValue = (coupon: Coupon) => {
        if (coupon.type === 'GIFT') {
            return `₹${coupon.giftAmount || 0}`;
        }
        if (coupon.discountType === 'PERCENTAGE') {
            return `${coupon.discountValue || 0}%`;
        }
        return `₹${coupon.discountValue || 0}`;
    };

    // Loading state
    if (loading) {
        return (
            <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
                <div className="flex justify-between items-center">
                    <PremiumSkeleton className="h-10 w-64 bg-white/5" />
                    <div className="flex gap-3">
                        <PremiumSkeleton className="h-10 w-36 bg-white/5" />
                        <PremiumSkeleton className="h-10 w-32 bg-white/5" />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => (
                        <PremiumSkeleton key={i} className="h-32 bg-white/5" />
                    ))}
                </div>
                <PremiumSkeleton className="h-16 bg-white/5" />
                <PremiumSkeleton className="h-96 bg-white/5" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-32">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 rounded-xl bg-purple-500/10">
                            <Ticket className="w-6 h-6 text-purple-400" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                            Coupon Engine
                        </h1>
                    </div>
                    <p className="text-white/40 text-sm max-w-md">
                        Create and manage promo codes, gift cards, and referral programs with enterprise-grade controls.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-wrap gap-3"
                >
                    <Button
                        variant="ghost"
                        className="h-10 px-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                        onClick={() => setShowBatchModal(true)}
                    >
                        <Gift className="w-4 h-4 mr-2" />
                        Batch Gift Cards
                    </Button>
                    <Button
                        className="h-10 px-4 bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Coupon
                    </Button>
                </motion.div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    icon={Ticket}
                    label="Total Coupons"
                    value={analytics?.totalCoupons || 0}
                    color="purple"
                />
                <StatCard
                    icon={Sparkles}
                    label="Active Coupons"
                    value={analytics?.activeCoupons || 0}
                    color="green"
                />
                <StatCard
                    icon={TrendingUp}
                    label="Total Redemptions"
                    value={analytics?.totalRedemptions || 0}
                    trend="+12%"
                    color="blue"
                />
                <StatCard
                    icon={DollarSign}
                    label="Value Given"
                    value={`₹${analytics?.totalDiscountGiven?.toFixed(0) || 0}`}
                    color="amber"
                />
            </div>

            {/* Filters Bar */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <GlassCard className="p-4">
                    <div className="flex flex-col lg:flex-row gap-4">
                        {/* Tabs */}
                        <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0">
                            {(['all', 'promo', 'gift', 'referral'] as const).map((tab) => {
                                const isActive = activeTab === tab;
                                const config = tab === 'all' ? null : getTypeConfig(tab.toUpperCase());
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${isActive
                                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                                            : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                                            }`}
                                    >
                                        {tab === 'all' ? 'All Types' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Search */}
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <Input
                                type="text"
                                placeholder="Search by code or name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-white/5 border-white/10 h-10 text-white placeholder-white/30"
                            />
                        </div>

                        {/* Refresh */}
                        <Button
                            variant="ghost"
                            className="h-10 px-4 bg-white/5 border border-white/10 text-white/50 hover:bg-white/10"
                            onClick={() => { fetchCoupons(); fetchAnalytics(); }}
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Refresh
                        </Button>
                    </div>
                </GlassCard>
            </motion.div>

            {/* Coupons Table */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <GlassCard className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="text-left px-5 py-4 text-[10px] text-white/40 font-bold uppercase tracking-widest">Code</th>
                                    <th className="text-left px-5 py-4 text-[10px] text-white/40 font-bold uppercase tracking-widest">Type</th>
                                    <th className="text-left px-5 py-4 text-[10px] text-white/40 font-bold uppercase tracking-widest">Value</th>
                                    <th className="text-left px-5 py-4 text-[10px] text-white/40 font-bold uppercase tracking-widest">Usage</th>
                                    <th className="text-left px-5 py-4 text-[10px] text-white/40 font-bold uppercase tracking-widest">Status</th>
                                    <th className="text-left px-5 py-4 text-[10px] text-white/40 font-bold uppercase tracking-widest">Expires</th>
                                    <th className="text-right px-5 py-4 text-[10px] text-white/40 font-bold uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {coupons.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-16 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="p-4 rounded-full bg-white/5">
                                                    <Ticket className="w-8 h-8 text-white/20" />
                                                </div>
                                                <div>
                                                    <p className="text-white/50 font-medium">No coupons found</p>
                                                    <p className="text-white/30 text-sm mt-1">Create your first coupon to get started</p>
                                                </div>
                                                <Button
                                                    className="mt-2 bg-purple-600 hover:bg-purple-700"
                                                    size="sm"
                                                    onClick={() => setShowCreateModal(true)}
                                                >
                                                    <Plus className="w-4 h-4 mr-2" />
                                                    Create Coupon
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    <AnimatePresence>
                                        {coupons.map((coupon, idx) => {
                                            const typeConfig = getTypeConfig(coupon.type);
                                            const statusConfig = getStatusConfig(coupon.status);
                                            const TypeIcon = typeConfig.icon;
                                            const isExpanded = expandedRow === coupon.id;

                                            return (
                                                <motion.tr
                                                    key={coupon.id}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                                                >
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <code className="text-white font-mono text-sm bg-white/5 px-2 py-1 rounded">
                                                                {coupon.code}
                                                            </code>
                                                            <button
                                                                onClick={() => copyToClipboard(coupon.code)}
                                                                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                {copiedCode === coupon.code ? (
                                                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                                ) : (
                                                                    <Copy className="w-3.5 h-3.5 text-white/40" />
                                                                )}
                                                            </button>
                                                        </div>
                                                        {coupon.name && (
                                                            <p className="text-white/30 text-xs mt-1">{coupon.name}</p>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${typeConfig.bg} ${typeConfig.text} ${typeConfig.border}`}>
                                                            <TypeIcon className="w-3 h-3" />
                                                            {coupon.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className="text-white font-mono font-medium">
                                                            {formatValue(coupon)}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-purple-500 rounded-full transition-all"
                                                                    style={{
                                                                        width: coupon.maxUses === 0
                                                                            ? '0%'
                                                                            : `${Math.min((coupon.currentUses / coupon.maxUses) * 100, 100)}%`
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-white/50 text-sm font-mono">
                                                                {coupon.currentUses}/{coupon.maxUses === 0 ? '∞' : coupon.maxUses}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                                                            {coupon.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className="text-white/40 text-sm">
                                                            {coupon.expiresAt
                                                                ? new Date(coupon.expiresAt).toLocaleDateString('en-IN', {
                                                                    day: 'numeric',
                                                                    month: 'short',
                                                                    year: 'numeric'
                                                                })
                                                                : 'Never'
                                                            }
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => openEditModal(coupon)}
                                                                className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                                                title="Edit"
                                                            >
                                                                <Edit3 className="w-4 h-4" />
                                                            </button>
                                                            {coupon.status === 'ACTIVE' && (
                                                                <button
                                                                    onClick={() => handleDisableCoupon(coupon.id, coupon.code)}
                                                                    className="p-2 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
                                                                    title="Disable"
                                                                >
                                                                    <XCircle className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </AnimatePresence>
                                )}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            </motion.div>

            {/* Top Coupons Section */}
            {analytics?.topCoupons && analytics.topCoupons.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <GlassCard className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <BarChart3 className="w-5 h-5 text-purple-400" />
                            <h2 className="text-lg font-bold text-white">Top Performing Coupons</h2>
                            <span className="text-xs text-white/30 ml-2">Last 30 days</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {analytics.topCoupons.slice(0, 3).map((coupon, idx) => {
                                const config = getTypeConfig(coupon.type);
                                return (
                                    <div
                                        key={coupon.code}
                                        className="p-4 rounded-xl bg-white/[0.02] border border-white/5"
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <code className="text-sm font-mono text-white bg-white/5 px-2 py-0.5 rounded">
                                                {coupon.code}
                                            </code>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
                                                #{idx + 1}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-white/40">Redemptions</span>
                                            <span className="text-white font-medium">{coupon.redemptions}</span>
                                        </div>
                                        <div className="flex justify-between text-sm mt-1">
                                            <span className="text-white/40">Value Given</span>
                                            <span className="text-emerald-400 font-mono">₹{coupon.totalValue}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </GlassCard>
                </motion.div>
            )}

            {/* Create Coupon Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowCreateModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                        >
                            <div className="p-6 border-b border-white/5">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-purple-400" />
                                    Create New Coupon
                                </h2>
                                <p className="text-white/40 text-sm mt-1">Configure your coupon settings</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Type Selection */}
                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Coupon Type</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setCreateForm(f => ({ ...f, type: 'PROMO' }))}
                                            className={`p-4 rounded-xl border transition-all ${createForm.type === 'PROMO'
                                                ? 'bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/20'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            <Percent className={`w-5 h-5 mb-2 ${createForm.type === 'PROMO' ? 'text-purple-400' : 'text-white/40'}`} />
                                            <p className={`font-medium ${createForm.type === 'PROMO' ? 'text-white' : 'text-white/60'}`}>
                                                Promo Code
                                            </p>
                                            <p className="text-xs text-white/30 mt-1">Discount on deposits</p>
                                        </button>
                                        <button
                                            onClick={() => setCreateForm(f => ({ ...f, type: 'GIFT' }))}
                                            className={`p-4 rounded-xl border transition-all ${createForm.type === 'GIFT'
                                                ? 'bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/20'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            <Gift className={`w-5 h-5 mb-2 ${createForm.type === 'GIFT' ? 'text-amber-400' : 'text-white/40'}`} />
                                            <p className={`font-medium ${createForm.type === 'GIFT' ? 'text-white' : 'text-white/60'}`}>
                                                Gift Card
                                            </p>
                                            <p className="text-xs text-white/30 mt-1">Fixed wallet credit</p>
                                        </button>
                                    </div>
                                </div>

                                {/* Name */}
                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Name (Optional)</label>
                                    <Input
                                        value={createForm.name}
                                        onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="e.g., Welcome Bonus"
                                        className="bg-white/5 border-white/10 h-10"
                                    />
                                </div>

                                {/* Promo-specific fields */}
                                {createForm.type === 'PROMO' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Discount Type</label>
                                                <select
                                                    value={createForm.discountType}
                                                    onChange={(e) => setCreateForm(f => ({ ...f, discountType: e.target.value as any }))}
                                                    className="w-full px-4 py-2 h-10 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-500/50"
                                                >
                                                    <option value="PERCENTAGE">Percentage</option>
                                                    <option value="FIXED">Fixed Amount</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">
                                                    {createForm.discountType === 'PERCENTAGE' ? 'Percentage' : 'Amount (₹)'}
                                                </label>
                                                <Input
                                                    type="number"
                                                    value={createForm.discountValue}
                                                    onChange={(e) => setCreateForm(f => ({ ...f, discountValue: e.target.value }))}
                                                    placeholder={createForm.discountType === 'PERCENTAGE' ? '10' : '100'}
                                                    className="bg-white/5 border-white/10 h-10"
                                                />
                                            </div>
                                        </div>

                                        {createForm.discountType === 'PERCENTAGE' && (
                                            <div>
                                                <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Max Discount (₹)</label>
                                                <Input
                                                    type="number"
                                                    value={createForm.maxDiscount}
                                                    onChange={(e) => setCreateForm(f => ({ ...f, maxDiscount: e.target.value }))}
                                                    placeholder="500"
                                                    className="bg-white/5 border-white/10 h-10"
                                                />
                                                <span className="text-[9px] text-white/20 mt-1 block">Maximum discount cap</span>
                                            </div>
                                        )}

                                        <div>
                                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Min Deposit (₹)</label>
                                            <Input
                                                type="number"
                                                value={createForm.minDepositAmount}
                                                onChange={(e) => setCreateForm(f => ({ ...f, minDepositAmount: e.target.value }))}
                                                placeholder="100"
                                                className="bg-white/5 border-white/10 h-10"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Gift-specific fields */}
                                {createForm.type === 'GIFT' && (
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Gift Amount (₹)</label>
                                        <Input
                                            type="number"
                                            value={createForm.giftAmount}
                                            onChange={(e) => setCreateForm(f => ({ ...f, giftAmount: e.target.value }))}
                                            placeholder="100"
                                            className="bg-white/5 border-white/10 h-10"
                                        />
                                    </div>
                                )}

                                {/* Usage Limits */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Total Uses (0=∞)</label>
                                        <Input
                                            type="number"
                                            value={createForm.maxUses}
                                            onChange={(e) => setCreateForm(f => ({ ...f, maxUses: e.target.value }))}
                                            className="bg-white/5 border-white/10 h-10"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Per User</label>
                                        <Input
                                            type="number"
                                            value={createForm.maxUsesPerUser}
                                            onChange={(e) => setCreateForm(f => ({ ...f, maxUsesPerUser: e.target.value }))}
                                            className="bg-white/5 border-white/10 h-10"
                                        />
                                    </div>
                                </div>

                                {/* Expiry */}
                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Expires At</label>
                                    <Input
                                        type="datetime-local"
                                        value={createForm.expiresAt}
                                        onChange={(e) => setCreateForm(f => ({ ...f, expiresAt: e.target.value }))}
                                        className="bg-white/5 border-white/10 h-10"
                                    />
                                </div>

                                {/* New Users Only */}
                                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                    <input
                                        type="checkbox"
                                        checked={createForm.newUsersOnly}
                                        onChange={(e) => setCreateForm(f => ({ ...f, newUsersOnly: e.target.checked }))}
                                        className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-600 focus:ring-purple-500"
                                    />
                                    <div>
                                        <span className="text-white text-sm">New users only</span>
                                        <p className="text-white/30 text-xs">Only valid for first-time deposits</p>
                                    </div>
                                </label>
                            </div>

                            {/* Actions */}
                            <div className="p-6 border-t border-white/5 flex gap-3">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-11 bg-white/5 text-white/60 hover:bg-white/10"
                                    onClick={() => setShowCreateModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1 h-11 bg-purple-600 hover:bg-purple-700 text-white"
                                    onClick={handleCreateCoupon}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Plus className="w-4 h-4 mr-2" />
                                    )}
                                    {saving ? 'Creating...' : 'Create Coupon'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit Coupon Modal */}
            <AnimatePresence>
                {showEditModal && editingCoupon && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowEditModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-lg"
                        >
                            <div className="p-6 border-b border-white/5">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Edit3 className="w-5 h-5 text-blue-400" />
                                    Edit Coupon
                                </h2>
                                <code className="text-sm text-white/50 font-mono mt-1">{editingCoupon.code}</code>
                            </div>

                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Name</label>
                                    <Input
                                        value={editForm.name}
                                        onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                                        className="bg-white/5 border-white/10 h-10"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Description</label>
                                    <Input
                                        value={editForm.description}
                                        onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                                        className="bg-white/5 border-white/10 h-10"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Max Uses</label>
                                        <Input
                                            type="number"
                                            value={editForm.maxUses}
                                            onChange={(e) => setEditForm(f => ({ ...f, maxUses: e.target.value }))}
                                            className="bg-white/5 border-white/10 h-10"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Per User</label>
                                        <Input
                                            type="number"
                                            value={editForm.maxUsesPerUser}
                                            onChange={(e) => setEditForm(f => ({ ...f, maxUsesPerUser: e.target.value }))}
                                            className="bg-white/5 border-white/10 h-10"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Expires At</label>
                                    <Input
                                        type="datetime-local"
                                        value={editForm.expiresAt}
                                        onChange={(e) => setEditForm(f => ({ ...f, expiresAt: e.target.value }))}
                                        className="bg-white/5 border-white/10 h-10"
                                    />
                                </div>
                            </div>

                            <div className="p-6 border-t border-white/5 flex gap-3">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-11 bg-white/5 text-white/60 hover:bg-white/10"
                                    onClick={() => setShowEditModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={handleUpdateCoupon}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Check className="w-4 h-4 mr-2" />
                                    )}
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Batch Gift Cards Modal */}
            <AnimatePresence>
                {showBatchModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setShowBatchModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-md"
                        >
                            <div className="p-6 border-b border-white/5">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Gift className="w-5 h-5 text-amber-400" />
                                    Generate Gift Cards
                                </h2>
                                <p className="text-white/40 text-sm mt-1">Bulk create and download as CSV</p>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Count (1-100)</label>
                                        <Input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={batchForm.count}
                                            onChange={(e) => setBatchForm(f => ({ ...f, count: e.target.value }))}
                                            className="bg-white/5 border-white/10 h-10"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Amount (₹)</label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={batchForm.amount}
                                            onChange={(e) => setBatchForm(f => ({ ...f, amount: e.target.value }))}
                                            className="bg-white/5 border-white/10 h-10"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Batch Name (Optional)</label>
                                    <Input
                                        value={batchForm.name}
                                        onChange={(e) => setBatchForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="e.g., February Promotion"
                                        className="bg-white/5 border-white/10 h-10"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Expires At</label>
                                    <Input
                                        type="datetime-local"
                                        value={batchForm.expiresAt}
                                        onChange={(e) => setBatchForm(f => ({ ...f, expiresAt: e.target.value }))}
                                        className="bg-white/5 border-white/10 h-10"
                                    />
                                </div>

                                {/* Preview */}
                                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-amber-400 text-sm">
                                                This will generate <strong>{batchForm.count}</strong> gift cards worth <strong>₹{batchForm.amount}</strong> each.
                                            </p>
                                            <p className="text-amber-400/60 text-sm mt-1">
                                                Total value: <strong className="font-mono">₹{parseInt(batchForm.count || '0') * parseFloat(batchForm.amount || '0')}</strong>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t border-white/5 flex gap-3">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-11 bg-white/5 text-white/60 hover:bg-white/10"
                                    onClick={() => setShowBatchModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 text-white"
                                    onClick={handleBatchGenerate}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Download className="w-4 h-4 mr-2" />
                                    )}
                                    {saving ? 'Generating...' : 'Generate & Download'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
