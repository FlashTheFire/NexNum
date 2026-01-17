"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

export default function CTA() {
    const t = useTranslations('cta');
    const tc = useTranslations('common');

    return (
        <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
            {/* Background Patterns */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white blur-3xl"></div>
                <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-white blur-3xl"></div>
            </div>

            <div className="container mx-auto px-4 relative z-10 text-center">
                <h2 className="text-3xl md:text-5xl font-bold mb-6 max-w-4xl mx-auto">
                    {t('title')}
                </h2>
                <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
                    {t('description')}
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link href="/register">
                        <Button size="lg" variant="secondary" className="h-14 px-8 text-lg font-semibold w-full sm:w-auto">
                            {t('button')} <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </Link>
                    <Link href="/contact">
                        <Button size="lg" variant="outline" className="h-14 px-8 text-lg bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10 w-full sm:w-auto">
                            {tc('contactSales')}
                        </Button>
                    </Link>
                </div>
            </div>
        </section>
    );
}
