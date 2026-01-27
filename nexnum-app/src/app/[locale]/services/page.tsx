"use client"

import { useState } from "react"
import Navbar from "@/components/layout/Navbar"
import Footer from "@/components/layout/Footer"
import MobileActionBar from "@/components/common/MobileActionBar"
import { motion } from "framer-motion"
import { Search, Globe, CheckCircle2, Zap, ArrowRight, Smartphone } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import CTA from "@/components/home/CTA"

import { formatPrice } from "@/lib/utils/utils"

// Mock Data for Display (Updated to COINS: 0.15 -> 15)
const popularServices = [
    { id: 'whatsapp', name: 'WhatsApp', price: 15, icon: 'brands/whatsapp.svg' },
    { id: 'telegram', name: 'Telegram', price: 20, icon: 'brands/telegram.svg' },
    { id: 'google', name: 'Google / Gmail', price: 10, icon: 'brands/google.svg' },
    { id: 'facebook', name: 'Facebook', price: 8, icon: 'brands/facebook.svg' },
    { id: 'instagram', name: 'Instagram', price: 12, icon: 'brands/instagram.svg' },
    { id: 'twitter', name: 'X (Twitter)', price: 10, icon: 'brands/twitter.svg' },
    { id: 'tiktok', name: 'TikTok', price: 18, icon: 'brands/tiktok.svg' },
    { id: 'discord', name: 'Discord', price: 15, icon: 'brands/discord.svg' },
    { id: 'uber', name: 'Uber', price: 25, icon: 'brands/uber.svg' },
    { id: 'openai', name: 'OpenAI / ChatGPT', price: 30, icon: 'brands/openai.svg' },
    { id: 'amazon', name: 'Amazon', price: 15, icon: 'brands/amazon.svg' },
    { id: 'netflix', name: 'Netflix', price: 20, icon: 'brands/netflix.svg' },
]

const countries = [
    { code: 'US', name: 'United States', price: 50 },
    { code: 'GB', name: 'United Kingdom', price: 45 },
    { code: 'DE', name: 'Germany', price: 60 },
    { code: 'FR', name: 'France', price: 55 },
    { code: 'CA', name: 'Canada', price: 50 },
    { code: 'NL', name: 'Netherlands', price: 40 },
    { code: 'ES', name: 'Spain', price: 45 },
    { code: 'ID', name: 'Indonesia', price: 15 },
    { code: 'VN', name: 'Vietnam', price: 10 },
    { code: 'PH', name: 'Philippines', price: 15 },
    { code: 'BR', name: 'Brazil', price: 20 },
    { code: 'IN', name: 'India', price: 10 },
]

export default function ServicesPage() {
    const [searchQuery, setSearchQuery] = useState("")

    const filteredServices = popularServices.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="min-h-screen flex flex-col bg-[#0a0a0c]">
            <Navbar />

            <main className="flex-1 pt-24 md:pt-32 pb-20">
                {/* Header */}
                <div className="container mx-auto px-4 md:px-6 relative z-10 text-center mb-16">
                    {/* Background Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[hsl(var(--neon-lime))] opacity-[0.03] blur-[120px] rounded-full pointer-events-none" />

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="max-w-3xl mx-auto space-y-6"
                    >
                        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white">
                            Transparent <span className="text-[hsl(var(--neon-lime))]">Pricing</span>
                        </h1>
                        <p className="text-xl text-gray-400">
                            Pay only for what you verify. No hidden fees, monthly subscriptions, or expired numbers.
                        </p>

                        <div className="relative max-w-xl mx-auto mt-8">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-gray-500" />
                            </div>
                            <Input
                                placeholder="Search service (e.g. WhatsApp, OpenAI)..."
                                className="h-14 pl-12 bg-white/[0.03] border-white/10 text-lg rounded-2xl focus:border-[hsl(var(--neon-lime))]/50 focus:bg-white/[0.05] transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </motion.div>
                </div>

                {/* Popular Services Grid */}
                <div className="container mx-auto px-4 md:px-6 mb-24">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Smartphone className="h-6 w-6 text-[hsl(var(--neon-lime))]" />
                            Popular Services
                        </h2>
                        <Link href="/register">
                            <Button variant="ghost" className="text-[hsl(var(--neon-lime))] hover:text-white hover:bg-white/5">
                                View all 100+ services <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {filteredServices.map((service, index) => (
                            <motion.div
                                key={service.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className="group relative p-4 rounded-2xl bg-[#111318] border border-white/5 hover:border-[hsl(var(--neon-lime))]/30 hover:bg-white/[0.02] transition-all duration-300"
                            >
                                <div className="flex flex-col items-center text-center space-y-3">
                                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                        {/* Placeholder for icon, using text first letter if no image */}
                                        <span className="text-xl font-bold text-white">{service.name[0]}</span>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                            {service.name}
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                            from <span className="text-white font-mono">{formatPrice(service.price)}</span>
                                        </p>
                                    </div>
                                    <Link href="/dashboard/buy" className="w-full">
                                        <Button size="sm" className="w-full bg-white/5 text-gray-300 hover:text-black hover:bg-[hsl(var(--neon-lime))] border border-white/5">
                                            Buy
                                        </Button>
                                    </Link>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Global Coverage Section */}
                <div className="container mx-auto px-4 md:px-6 mb-24">
                    <div className="bg-gradient-to-br from-[#111318] to-black border border-white/10 rounded-3xl p-8 md:p-12 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 opacity-10">
                            <Globe className="w-64 h-64 text-white" />
                        </div>

                        <div className="relative z-10">
                            <h2 className="text-3xl font-bold text-white mb-6">Global Coverage</h2>
                            <p className="text-lg text-gray-400 max-w-2xl mb-12">
                                Access numbers from over 180 countries. Whether you need a US number for Google or an Indonesian number for specialized services, we have you covered.
                            </p>

                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-6 gap-x-4">
                                {countries.map((country) => (
                                    <div key={country.code} className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white border border-white/10">
                                            {country.code}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-white">{country.name}</div>
                                            <div className="text-xs text-gray-500">from {formatPrice(country.price)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-12 flex items-center gap-4">
                                <Link href="/dashboard/buy">
                                    <Button className="bg-white text-black hover:bg-gray-200 font-semibold px-8 h-12 rounded-xl">
                                        View All Countries
                                    </Button>
                                </Link>
                                <div className="flex items-center gap-2 text-sm text-[hsl(var(--neon-lime))]">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Instant Activation</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-[hsl(var(--neon-lime))]">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>High Success Rate</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <CTA />
            </main>

            <MobileActionBar />
            <Footer />
        </div>
    )
}
