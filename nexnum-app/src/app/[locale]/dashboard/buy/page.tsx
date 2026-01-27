"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { useGlobalStore } from "@/stores/appStore"
import { DashboardBackground } from "../components/dashboard-background"

import BuyPageHeader from "./components/BuyPageHeader"
import ServiceSelector from "./components/ServiceSelector"
import CountrySelector from "./components/CountrySelector"
import ProviderSelector, { Provider } from "./components/ProviderSelector"

export default function BuyPage() {
    const { userProfile, purchaseNumber, fetchBalance } = useGlobalStore()
    const router = useRouter()
    const searchParams = useSearchParams()

    // --- State ---
    const [step, setStep] = useState<1 | 2 | 3>(1)

    // Selections
    const [selectedService, setSelectedService] = useState<{ id: string, name: string, iconUrl?: string } | null>(null)
    const [selectedCountry, setSelectedCountry] = useState<any | null>(null)

    // Filters within Wizard
    const [localSearch, setLocalSearch] = useState("")
    const [sortOption, setSortOption] = useState<"relevance" | "price_asc" | "stock_desc">("relevance")

    // --- Effects ---

    // Auto-select product/country from URL
    useEffect(() => {
        const productParam = searchParams.get('service') || searchParams.get('product')
        const selectedCountryParam = searchParams.get('selectedCountry')

        if (productParam && !selectedService) {
            // Basic normalization (e.g. "whatsapp" -> "Whatsapp")
            const formattedName = productParam.charAt(0).toUpperCase() + productParam.slice(1)
            setSelectedService({
                id: productParam,
                name: formattedName,
                iconUrl: undefined
            })

            if (selectedCountryParam && !selectedCountry) {
                // Use name as identity for country as well
                setSelectedCountry({
                    id: selectedCountryParam,
                    name: selectedCountryParam,
                    code: ''
                })
            }

            // Always start at step 2 when coming from deep link to allow "others below" visibility
            setStep(2)
        }
    }, [searchParams])

    // Reset local search and sort when changing steps
    useEffect(() => {
        setLocalSearch("")
        setSortOption("relevance")
    }, [step])

    // --- Handlers ---

    const handleServiceSelect = (id: string, name: string, iconUrl?: string) => {
        setSelectedService({ id, name, iconUrl })
        setStep(2)
        window.scrollTo({ top: 0, behavior: "instant" })
    }

    const handleCountrySelect = (country: any) => {
        setSelectedCountry(country)
        setStep(3)
        window.scrollTo({ top: 0, behavior: "instant" })
    }

    const handlePurchase = async (provider: Provider) => {
        if (!userProfile) return
        if (userProfile.balance < provider.price) {
            toast.error("Insufficient balance", { description: "Please top up your wallet." })
            return
        }

        const toastId = toast.loading("Reserving number...")
        try {
            // Pass provider name as restricted provider (Phase 11: Backend strictly uses this)
            // If Best Route, provider must be undefined, and we pass options
            const providerName = provider.isBestRoute ? undefined : provider.displayName;
            const options = provider.isBestRoute ? { useBestRoute: true, maxPrice: provider.maxPrice } : undefined;

            const result = await purchaseNumber(provider.countryCode, provider.serviceCode, providerName, options)
            if (!result.success) throw new Error(result.error || "Purchase failed")

            await fetchBalance()
            toast.dismiss(toastId)
            toast.success("Success!", { description: `${provider.serviceName} number is ready.` })
            router.push(`/sms/${result.number?.id || ''}`)
        } catch (error: any) {
            toast.dismiss(toastId)

            // Smart Error Handling (Phase 55)
            if (error.code === 'E_INSUFFICIENT_FUNDS') {
                toast.error("Insufficient Funds", {
                    description: "You need more credit to complete this purchase.",
                    action: {
                        label: "Top Up Now",
                        onClick: () => router.push('/dashboard/wallet/deposit')
                    },
                    duration: 8000
                })
            } else {
                toast.error("Purchase Failed", { description: error.message })
            }
        }
    }

    const handleBack = () => {
        if (step === 3) {
            setStep(2)
            window.scrollTo({ top: 0, behavior: "instant" })
        } else if (step === 2) {
            setStep(1)
            window.scrollTo({ top: 0, behavior: "instant" })
        } else {
            router.push('/dashboard')
        }
    }

    // --- UI Helpers ---

    const getStepTitle = () => {
        switch (step) {
            case 1: return "Select Service"
            case 2: return "Select Country"
            case 3: return "Select Provider"
        }
    }

    return (
        <div className="relative min-h-screen pb-20">
            <DashboardBackground />

            <div className="relative z-10 container mx-auto px-4 md:px-6 max-w-7xl -mt-6 md:mt-0">

                <BuyPageHeader
                    step={step}
                    onBack={handleBack}
                    userBalance={userProfile?.balance || 0}
                    title={getStepTitle()}
                    searchTerm={localSearch}
                    setSearchTerm={setLocalSearch}
                    sortOption={sortOption}
                    setSortOption={setSortOption}
                    selectedServiceIcon={selectedService?.iconUrl}
                />

                <div className="min-h-[500px]">
                    <AnimatePresence mode="wait">
                        {/* STEP 1: SERVICE */}
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ServiceSelector
                                    selectedService={selectedService?.id || null}
                                    defaultSelected={selectedService}
                                    onSelect={handleServiceSelect}
                                    searchTerm={localSearch}
                                    sortOption={sortOption}
                                />
                            </motion.div>
                        )}

                        {/* STEP 2: COUNTRY */}
                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                <CountrySelector
                                    onSelect={handleCountrySelect}
                                    selectedCountryId={selectedCountry?.id}
                                    defaultSelected={selectedCountry}
                                    searchTerm={localSearch}
                                    selectedService={selectedService}
                                    sortOption={sortOption}
                                />
                            </motion.div>
                        )}

                        {/* STEP 3: PROVIDERS */}
                        {step === 3 && selectedService && selectedCountry && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ProviderSelector
                                    serviceName={selectedService.name}
                                    countryName={selectedCountry.name}
                                    onBuy={handlePurchase}
                                    sortOption={sortOption}
                                    serviceIcon={selectedService.iconUrl}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
