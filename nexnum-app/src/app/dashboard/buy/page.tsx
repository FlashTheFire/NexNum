"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    ShoppingCart,
    Loader2,
    ArrowRight,
    ArrowLeft,
    Check,
    Globe,
    Smartphone,
    Signal
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { useAuthStore } from "@/stores/authStore"
import { formatPrice } from "@/lib/utils"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import BuyPageHeader from "./components/BuyPageHeader";
import ServiceSelector from "./components/ServiceSelector";
import CountrySelector from "./components/CountrySelector";
import BuyPageHero from "./components/BuyPageHero";
import { DashboardBackground } from "../components/dashboard-background";

// --- Mock Data Logic ---
// In a real app, this would come from an API based on Service + Country
const generateOperators = (serviceId: string, countryId: string) => {
    // Generate slight variations based on inputs
    const basePrice =
        (countryId === 'us' ? 1.5 :
            countryId === 'gb' ? 2.0 :
                countryId === 'in' ? 0.5 : 1.0) +
        (serviceId === 'whatsapp' ? 0.5 : 0.2);

    return [
        { id: "op_1", name: "Standard", carrier: "Mixed", price: basePrice, successRate: "85%", stock: "High" },
        { id: "op_2", name: "Premium", carrier: "T-Mobile/AT&T", price: basePrice * 1.5, successRate: "98%", stock: "Med" },
        { id: "op_3", name: "Private", carrier: "Veriz/Vodafone", price: basePrice * 2.5, successRate: "99.9%", stock: "Low" }
    ];
};

export default function BuyPage() {
    const { userProfile, purchaseNumber, fetchBalance } = useGlobalStore()
    const router = useRouter()

    // Flow State
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Selection State
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedService, setSelectedService] = useState<string | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<any | null>(null);
    const [selectedOperator, setSelectedOperator] = useState<any | null>(null);
    const [purchasing, setPurchasing] = useState(false);

    // Derived Data
    const availableOperators = selectedService && selectedCountry
        ? generateOperators(selectedService, selectedCountry.id)
        : [];

    const handleServiceSelect = (id: string) => {
        setSelectedService(id);
        setSearchTerm(""); // Reset search
        setStep(2);
    };

    const handleCountrySelect = (country: any) => {
        setSelectedCountry(country);
        setSearchTerm(""); // Reset search
        setStep(3);
    };

    const handlePurchase = async (operator: any) => {
        if (!userProfile) return;

        if (userProfile.balance < operator.price) {
            toast.error("Insufficient balance", {
                description: "Please top up your wallet to continue."
            });
            return;
        }

        setPurchasing(true);

        try {
            // Use real API purchase
            const result = await purchaseNumber(
                selectedCountry?.code || 'US',
                selectedService || 'telegram'
            );

            if (!result.success) {
                toast.error("Purchase Failed", {
                    description: result.error || "Something went wrong. Please try again."
                });
                return;
            }

            // Refresh balance after purchase
            await fetchBalance();

            toast.success("Number Purchased Successfully", {
                description: `${operator.name} number for ${selectedService} is now active.`
            });

            // Redirect to vault to see the number
            router.push('/dashboard/vault');

        } catch (error) {
            toast.error("Purchase Failed", {
                description: "Something went wrong. Please try again."
            });
        } finally {
            setPurchasing(false);
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep((step - 1) as 1 | 2 | 3);
            setSearchTerm("");
        } else {
            router.push('/dashboard');
        }
    };

    // Determine Title based on Step
    const getStepTitle = () => {
        switch (step) {
            case 1: return "Select Service";
            case 2: return "Select Country";
            case 3: return "Select Operator"; // Or stay "Select Service" if user insisted?
            // "in last step use same box with steps + balance" -> User snippet had "1 Select Service" -> I should probably use "3 Select Operator" for correctness but keeping style.
            default: return "Select Service";
        }
    };

    return (
        <div className="relative min-h-screen pb-20">
            <DashboardBackground />

            {/* Content Container */}
            <div className="relative z-10 container mx-auto px-4 md:px-6 max-w-7xl -mt-6 md:mt-0">

                <BuyPageHeader
                    step={step}
                    onBack={handleBack}
                    userBalance={userProfile?.balance || 0}
                    title={getStepTitle()}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                />

                {/* Main Content Area */}
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ServiceSelector
                                selectedService={selectedService}
                                onSelect={handleServiceSelect}
                                searchTerm={searchTerm}
                            />
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <CountrySelector
                                selectedCountryId={selectedCountry?.id}
                                onSelect={handleCountrySelect}
                                searchTerm={searchTerm}
                            />
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="max-w-4xl mx-auto py-8">
                                {/* NO Header here, header is sticky above */}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {availableOperators.map((op, idx) => (
                                        <motion.button
                                            key={op.id}
                                            onClick={() => handlePurchase(op)}
                                            disabled={purchasing}
                                            className="relative flex items-center justify-between p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[hsl(var(--neon-lime))] transition-all group text-left h-[88px]"
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                        >
                                            {/* Hover Gradient */}
                                            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--neon-lime)/0.05)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />

                                            {/* Left: Info */}
                                            <div className="flex items-center gap-4 z-10">
                                                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[hsl(var(--neon-lime))] group-hover:text-black transition-colors">
                                                    <Signal className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white text-lg">{op.name}</span>
                                                        {idx === 2 && (
                                                            <span className="text-[10px] font-bold bg-[hsl(var(--neon-lime))] text-black px-1.5 py-0.5 rounded-full">BEST</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                                        <span>{op.carrier}</span>
                                                        <span className="w-1 h-1 rounded-full bg-gray-600" />
                                                        <span className="text-green-400 font-mono">{op.successRate}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right: Price + Action */}
                                            <div className="z-10 text-right">
                                                <div className="font-mono text-xl font-bold text-[hsl(var(--neon-lime))]">
                                                    {formatPrice(op.price)}
                                                </div>
                                                <div className="text-[10px] text-gray-500 flex items-center justify-end gap-1">
                                                    Buy <ArrowRight className="w-3 h-3" />
                                                </div>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>


                {/* Hero / Footer Section - Moved to bottom */}
                <div className="mt-20">
                    <BuyPageHero />
                </div>
            </div>
        </div>
    )
}
