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
import SearchResults from "./components/SearchResults"
import { SearchOffer } from "./components/OfferCard"

export default function BuyPage() {
    const { userProfile, purchaseNumber, fetchBalance } = useGlobalStore()
    const router = useRouter()

    // --- State ---
    const [step, setStep] = useState<1 | 2 | 3>(1)

    // Selections
    const [selectedService, setSelectedService] = useState<{ id: string, name: string } | null>(null)
    const [selectedCountry, setSelectedCountry] = useState<any | null>(null)

    // Search/Step 3 Data
    const [offers, setOffers] = useState<SearchOffer[]>([])
    const [loadingOffers, setLoadingOffers] = useState(false)
    const [totalOffers, setTotalOffers] = useState(0)

    // Filters within Wizard (e.g. searching for a country in Step 2)
    const [localSearch, setLocalSearch] = useState("")

    // --- Effects ---

    // Reset local search when changing steps
    useEffect(() => {
        setLocalSearch("")
    }, [step])

    // Step 3: Fetch Offers
    useEffect(() => {
        if (step === 3 && selectedService && selectedCountry) {
            fetchOffers()
        }
    }, [step, selectedService, selectedCountry])

    const fetchOffers = async () => {
        setLoadingOffers(true)
        try {
            // Search by Service Name (e.g. "WhatsApp") + Country Phone Code (e.g. "22")
            // This grabs offers from MeiliSearch
            const query = encodeURIComponent(selectedService?.name || "")
            const country = encodeURIComponent(selectedCountry?.phoneCode || "")

            const res = await fetch(`/api/search/offers?q=${query}&country=${country}&limit=50`)
            const data = await res.json()

            if (data.hits) {
                setOffers(data.hits)
                setTotalOffers(data.total)
            }
        } catch (error) {
            console.error("Failed to fetch offers", error)
            toast.error("Failed to load offers")
        } finally {
            setLoadingOffers(false)
        }
    }

    // --- Handlers ---

    const handleServiceSelect = (id: string, name: string) => {
        setSelectedService({ id, name })
        setStep(2)
    }

    const handleCountrySelect = (country: any) => {
        setSelectedCountry(country)
        setStep(3)
    }

    const handlePurchase = async (offer: SearchOffer) => {
        if (!userProfile) return
        if (userProfile.balance < offer.price) {
            toast.error("Insufficient balance", { description: "Please top up your wallet." })
            return
        }

        const toastId = toast.loading("Reserving number...")
        try {
            const result = await purchaseNumber(offer.countryCode, offer.serviceCode)
            if (!result.success) throw new Error(result.error || "Purchase failed")

            await fetchBalance()
            toast.dismiss(toastId)
            toast.success("Success!", { description: `${offer.serviceName} number is ready.` })
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

                    {/* STEP 3: OFFERS */}
                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                        >
                            <SearchResults
                                results={offers}
                                totals={totalOffers}
                                loading={loadingOffers}
                                onBuy={handlePurchase}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
