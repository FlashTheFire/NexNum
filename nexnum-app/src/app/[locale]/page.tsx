import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/home/Hero";
import Features from "@/components/home/Features";
import FAQ from "@/components/home/FAQ";
import CTA from "@/components/home/CTA";
import MobileActionBar from "@/components/common/MobileActionBar";
import ServiceTicker from "@/components/home/ServiceTicker";

export default function Home() {
    return (
        <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">
                <Hero />
                <ServiceTicker />
                <Features />
                <FAQ />
                <CTA />
            </main>
            <MobileActionBar />
            <Footer />
        </div>
    );
}
