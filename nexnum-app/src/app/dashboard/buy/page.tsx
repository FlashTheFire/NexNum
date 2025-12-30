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
    const { userProfile, updateBalance, addActiveNumber } = useGlobalStore()
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

    // ... (handlePurchase remains same) ...

    const handleBackStep = (newStep: 1 | 2 | 3) => {
        setStep(newStep);
        setSearchTerm("");
    }

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
                    setStep={handleBackStep}
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

                                <div className="grid md:grid-cols-3 gap-6">
                                    {availableOperators.map((op, idx) => (
                                        <Card
                                            key={op.id}
                                            className="border-white/10 bg-card/30 backdrop-blur-sm hover:border-[hsl(var(--neon-lime))/50] transition-all group overflow-hidden relative"
                                        >
                                            {/* ... card content same ... */}
                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[hsl(var(--neon-lime))] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                            <CardContent className="p-6 space-y-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="font-bold text-lg text-white">{op.name}</h3>
                                                        <p className="text-sm text-gray-400">{op.carrier}</p>
                                                    </div>
                                                    {idx === 2 && (
                                                        <Badge className="bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime))]">Best</Badge>
                                                    )}
                                                </div>

                                                <div className="space-y-2 py-4">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-400">Success Rate</span>
                                                        <span className="text-green-400 font-bold">{op.successRate}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-400">Stock</span>
                                                        <span className="text-white">{op.stock}</span>
                                                    </div>
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-400">SMS Speed</span>
                                                        <span className="text-white">~15s</span>
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-white/5">
                                                    <div className="flex items-end gap-1 mb-4">
                                                        <span className="text-3xl font-bold text-[hsl(var(--neon-lime))]">{formatPrice(op.price)}</span>
                                                        <span className="text-sm text-gray-500 mb-1">/ number</span>
                                                    </div>

                                                    <Button
                                                        className="w-full bg-white text-black hover:bg-[hsl(var(--neon-lime))] hover:text-black font-bold transition-all"
                                                        onClick={() => handlePurchase(op)}
                                                        disabled={purchasing}
                                                    >
                                                        {purchasing ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <>Buy Now <ArrowRight className="w-4 h-4 ml-2" /></>
                                                        )}
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
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
