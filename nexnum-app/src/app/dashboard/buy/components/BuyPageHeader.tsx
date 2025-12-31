import { ArrowLeft, Search, ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/utils";

interface BuyPageHeaderProps {
    step: 1 | 2 | 3;
    onBack: () => void;
    userBalance: number;
    title: string;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
}

export default function BuyPageHeader({
    step,
    onBack,
    userBalance,
    title,
    searchTerm,
    setSearchTerm
}: BuyPageHeaderProps) {
    return (
        <div className="sticky top-[4px] md:top-4 z-40 bg-[#0a0a0c]/95 backdrop-blur-xl border-b border-white/5 py-3 -mx-4 px-4 md:mx-0 md:bg-[#0a0a0c]/80 md:border md:rounded-2xl md:px-6 md:py-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg transition-all">

            {/* Top Row (Mobile): Title + Wallet/Breadcrumbs */}
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                    {/* Back Button (Always Visible) */}
                    <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-full transition-colors -ml-1 group">
                        <ArrowLeft className="w-4 h-4 text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                    </button>

                    <h2 className="text-xl font-bold text-white flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--neon-lime))] text-black text-sm font-bold shadow-[0_0_15px_hsl(var(--neon-lime)/0.4)]">
                            {step}
                        </span>
                        {title}
                    </h2>
                </div>

                {/* Integrated Wallet/Breadcrumbs (Right Side) */}
                <div className="flex items-center gap-4">
                    {/* Hidden on very small screens if tight, but generally visible */}
                    <div className="hidden sm:flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium tracking-wide">
                        <span className={step >= 1 ? "text-[hsl(var(--neon-lime))]" : "text-zinc-500"}>Service</span>
                        <span className="text-zinc-700">/</span>
                        <span className={step >= 2 ? "text-[hsl(var(--neon-lime))]" : "text-zinc-500"}>Country</span>
                        <span className="text-zinc-700">/</span>
                        <span className={step >= 3 ? "text-[hsl(var(--neon-lime))]" : "text-zinc-500"}>Details</span>
                    </div>

                    <div className="flex items-center bg-zinc-900 rounded-full border border-white/5 px-2.5 py-1 gap-2">
                        <ShoppingCart className="h-3 w-3 text-[hsl(var(--neon-lime))]" />
                        <span className="text-[10px] sm:text-xs font-mono text-zinc-300">{formatPrice(userBalance)}</span>
                    </div>
                </div>
            </div>

            {/* Search Box - Full Width on Mobile, Right aligned on Desktop */}
            <div className="relative w-full md:w-64 group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                </div>
                <input
                    type="text"
                    placeholder="Search..."
                    className="w-full bg-[#0a0a0c] border border-white/10 text-sm rounded-xl py-2.5 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-[hsl(var(--neon-lime))/50] focus:bg-zinc-900/50 focus:shadow-[0_0_15px_rgba(204,255,0,0.1)] transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>
    );
}
