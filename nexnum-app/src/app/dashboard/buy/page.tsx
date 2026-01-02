"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useGlobalStore } from "@/store"
import { DashboardBackground } from "../components/dashboard-background"

import BuyPageHeader from "./components/BuyPageHeader"
import ServiceSelector from "./components/ServiceSelector"
import CountrySelector from "./components/CountrySelector"
import ProviderSelector, { Provider } from "./components/ProviderSelector"

export default function BuyPage() {
    const { userProfile, purchaseNumber, fetchBalance } = useGlobalStore()
    const router = useRouter()

    // --- State ---
    const [step, setStep] = useState<1 | 2 | 3>(1)

    // Selections
    const [selectedService, setSelectedService] = useState<{ id: string, name: string } | null>(null)
    const [selectedCountry, setSelectedCountry] = useState<any | null>(null)

    // Filters within Wizard (e.g. searching for a country in Step 2)
    const [localSearch, setLocalSearch] = useState("")

    // --- Effects ---

    // Reset local search when changing steps
    useEffect(() => {
        setLocalSearch("")
    }, [step])

    // --- Handlers ---

    const handleServiceSelect = (id: string, name: string) => {
        setSelectedService({ id, name })
        setStep(2)
    }

    const handleCountrySelect = (country: any) => {
        setSelectedCountry(country)
        setStep(3)
    }

    const handlePurchase = async (provider: Provider) => {
        if (!userProfile) return
        if (userProfile.balance < provider.price) {
            toast.error("Insufficient balance", { description: "Please top up your wallet." })
            return
        }

        const toastId = toast.loading("Reserving number...")
        try {
            const result = await purchaseNumber(provider.countryCode, provider.serviceCode)
            if (!result.success) throw new Error(result.error || "Purchase failed")

            await fetchBalance()
            toast.dismiss(toastId)
            toast.success("Success!", { description: `${provider.serviceName} number is ready.` })
            router.push('/dashboard/vault')
        } catch (error: any) {
            toast.dismiss(toastId)
            toast.error("Purchase Failed", { description: error.message })
        }
    }

    const handleBack = () => {
        if (step === 3) setStep(2)
        else if (step === 2) setStep(1)
        else router.push('/dashboard')
    }

    // --- UI Helpers ---

    const getStepTitle = () => {
        switch (step) {
            case 1: return "Select Service"
            case 2: return "Select Country"
            case 3: return `${selectedService?.name} in ${selectedCountry?.name}`
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
                />

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
                                onSelect={handleServiceSelect}
                                searchTerm={localSearch}
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
                                searchTerm={localSearch}
                                selectedServiceName={selectedService?.name}
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
                                serviceCode={selectedService.id}
                                serviceName={selectedService.name}
                                countryCode={selectedCountry.code || selectedCountry.id}
                                countryName={selectedCountry.name}
                                onBuy={handlePurchase}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
