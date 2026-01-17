import { ArrowLeft, Search, ShoppingCart, DollarSign, Package, TrendingUp, SlidersHorizontal } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BuyPageHeaderProps {
    step: 1 | 2 | 3;
    onBack: () => void;
    userBalance: number;
    title: string;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    sortOption: "relevance" | "price_asc" | "stock_desc";
    setSortOption: (sort: "relevance" | "price_asc" | "stock_desc") => void;
    selectedServiceIcon?: string;
}

export default function BuyPageHeader({
    step,
    onBack,
    userBalance,
    title,
    searchTerm,
    setSearchTerm,
    sortOption,
    setSortOption,
    selectedServiceIcon
}: BuyPageHeaderProps) {
    return (
        <div className="sticky top-[4px] md:top-4 z-40 bg-[#0a0a0c]/95 backdrop-blur-xl border-b border-white/5 py-2 -mx-4 px-4 md:mx-0 md:bg-[#0a0a0c]/80 md:border md:rounded-2xl md:px-5 md:py-3 mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg transition-all">

            {/* Top Row (Mobile): Title + Wallet/Breadcrumbs */}
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2.5">
                    {/* Back Button (Always Visible) */}
                    <button onClick={onBack} className="p-1.5 hover:bg-white/10 rounded-full transition-colors -ml-1 group">
                        <ArrowLeft className="w-4 h-4 text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                    </button>

                    <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(var(--neon-lime))] text-black text-xs font-bold shadow-[0_0_12px_hsl(var(--neon-lime)/0.4)]">
                            {step}
                        </span>
                        {title}
                    </h2>
                </div>

                {/* Integrated Wallet/Breadcrumbs (Right Side) */}
                <div className="flex items-center gap-3">
                    {/* Hidden on very small screens if tight, but generally visible */}
                    <div className="hidden sm:flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-medium tracking-wide">
                        <span className={step >= 1 ? "text-[hsl(var(--neon-lime))]" : "text-zinc-500"}>Service</span>
                        <span className="text-zinc-700">/</span>
                        <span className={step >= 2 ? "text-[hsl(var(--neon-lime))]" : "text-zinc-500"}>Country</span>
                        <span className="text-zinc-700">/</span>
                        <span className={step >= 3 ? "text-[hsl(var(--neon-lime))]" : "text-zinc-500"}>Details</span>
                    </div>

                    {step === 2 ? (
                        <div className="relative flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[hsl(var(--neon-lime))] ring-offset-1 ring-offset-[#0a0a0c] shadow-[0_0_10px_hsl(var(--neon-lime)/0.25)] bg-zinc-900 animate-in zoom-in duration-300">
                            <img
                                src={selectedServiceIcon || "/placeholder-icon.png"}
                                alt="Service"
                                className={cn(
                                    "w-full h-full object-contain", // Changed to object-contain for Logos
                                    !selectedServiceIcon && "p-1 opacity-80" // Styling for placeholder
                                )}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center bg-zinc-900 rounded-full border border-white/5 px-2.5 py-1 gap-2">
                            <ShoppingCart className="h-3 w-3 text-[hsl(var(--neon-lime))]" />
                            <span className="text-[10px] sm:text-xs font-mono text-zinc-300">{formatPrice(userBalance)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Search Box - Professional UI */}
            {step !== 3 && (
                <div className="relative w-full md:w-80 group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-zinc-500 group-focus-within:text-zinc-300 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full bg-[#0F0F11] border border-white/5 text-sm rounded-xl py-2.5 pl-10 pr-14 text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/10 focus:bg-[#151518] focus:shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />

                    {/* Sort Button - Integrated Icon */}
                    <div className="absolute inset-y-0 right-1.5 flex items-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className={cn(
                                        "p-2 rounded-xl transition-all duration-300 outline-none",
                                        "text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95",
                                        sortOption !== "relevance" && "text-[hsl(var(--neon-lime))] bg-[hsl(var(--neon-lime))/0.1]"
                                    )}
                                    type="button"
                                >
                                    {sortOption === "relevance" && <TrendingUp className="w-4 h-4" strokeWidth={2} />}
                                    {sortOption === "price_asc" && <DollarSign className="w-4 h-4" strokeWidth={2} />}
                                    {sortOption === "stock_desc" && <Package className="w-4 h-4" strokeWidth={2} />}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                sideOffset={10}
                                className="w-56 bg-[#0F0F11] border border-white/5 backdrop-blur-2xl p-1.5 rounded-xl shadow-2xl"
                            >
                                {/* Option: Relevance */}
                                <DropdownMenuItem
                                    onClick={() => setSortOption("relevance")}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors mb-1",
                                        sortOption === "relevance"
                                            ? "bg-[#113028] text-teal-100"  // Selected State (Dark Greenish Teal)
                                            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                                    )}
                                >
                                    <TrendingUp
                                        className={cn("w-4 h-4", sortOption === "relevance" ? "text-teal-200" : "text-zinc-500")}
                                    />
                                    Relevance
                                </DropdownMenuItem>

                                {/* Option: Lowest Price */}
                                <DropdownMenuItem
                                    onClick={() => setSortOption("price_asc")}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors mb-1",
                                        sortOption === "price_asc"
                                            ? "bg-[#113028] text-teal-100"
                                            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                                    )}
                                >
                                    <span className="flex items-center gap-3">
                                        <DollarSign
                                            className={cn("w-4 h-4", sortOption === "price_asc" ? "text-teal-200" : "text-zinc-500")}
                                        />
                                        Lowest Price
                                    </span>
                                </DropdownMenuItem>

                                {/* Option: Highest Stock */}
                                <DropdownMenuItem
                                    onClick={() => setSortOption("stock_desc")}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors",
                                        sortOption === "stock_desc"
                                            ? "bg-[#113028] text-teal-100"
                                            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                                    )}
                                >
                                    <Package
                                        className={cn("w-4 h-4", sortOption === "stock_desc" ? "text-teal-200" : "text-zinc-500")}
                                    />
                                    Highest Stock
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            )}
        </div>
    );
}
