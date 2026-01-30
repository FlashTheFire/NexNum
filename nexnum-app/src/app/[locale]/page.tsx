import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/home/Hero";
import Features from "@/components/home/Features";
import FAQ from "@/components/home/FAQ";
import CTA from "@/components/home/CTA";
import MobileActionBar from "@/components/common/MobileActionBar";
import ServiceTicker from "@/components/home/ServiceTicker";
import { GlobalCoverageMap } from "@/components/home/GlobalCoverageMap";
import Testimonials from "@/components/home/Testimonials";
import { setRequestLocale } from 'next-intl/server';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">
                <Hero />
                <ServiceTicker />
                <Features />
                <GlobalCoverageMap />
                <Testimonials />
                <FAQ />
                <CTA />
            </main>
            <MobileActionBar />
            <Footer />
        </div>
    );
}
