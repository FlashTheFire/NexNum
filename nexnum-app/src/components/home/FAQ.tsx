"use client";

import { useState, useEffect } from "react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslations } from "next-intl";

export default function FAQ() {
    const t = useTranslations('faq');
    const [isMounted, setIsMounted] = useState(false);

    // Fix hydration mismatch with Radix UI Accordion
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const faqKeys = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

    return (
        <section id="faq" className="py-24">
            <div className="container mx-auto px-4 max-w-4xl">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">{t('title')}</h2>
                    <p className="text-lg text-muted-foreground">
                        {t('subtitle')}
                    </p>
                </div>

                {isMounted ? (
                    <Accordion type="single" collapsible className="w-full">
                        {faqKeys.map((key, index) => (
                            <AccordionItem key={index} value={`item-${index}`}>
                                <AccordionTrigger className="text-left text-lg font-medium">
                                    {t(`${key}.question`)}
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground">
                                    {t(`${key}.answer`)}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                ) : (
                    // Skeleton placeholder during SSR
                    <div className="space-y-4">
                        {faqKeys.map((_, index) => (
                            <div key={index} className="border-b py-4">
                                <div className="h-6 bg-muted/20 rounded animate-pulse w-3/4" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
