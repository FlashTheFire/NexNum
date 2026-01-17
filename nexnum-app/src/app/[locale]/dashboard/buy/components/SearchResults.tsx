import { motion } from "framer-motion";
import { OfferCard, SearchOffer } from "./OfferCard";
import { Loader2 } from "lucide-react";

interface SearchResultsProps {
    results: SearchOffer[];
    totals: number;
    loading: boolean;
    onBuy: (offer: SearchOffer) => void;
}

export default function SearchResults({ results, totals, loading, onBuy }: SearchResultsProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-[88px] rounded-2xl bg-white/5 animate-pulse border border-white/5" />
                ))}
            </div>
        );
    }

    if (results.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <p>No offers found. Try a different search term.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                <span>Found {totals} offers</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((offer) => (
                    <OfferCard key={offer.id} offer={offer} onBuy={onBuy} />
                ))}
            </div>
        </div>
    );
}
