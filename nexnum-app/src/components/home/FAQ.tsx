import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
    {
        question: "Do these numbers work for all services?",
        answer: "Our numbers are real SIM-card based numbers, which means they work with almost all major services including WhatsApp, Telegram, Google, Facebook, and more. However, some services may have specific restrictions."
    },
    {
        question: "How long do I keep the number?",
        answer: "It depends on the plan you choose. 'Pay As You Go' numbers are typically available for 20 minutes for verification. Rental numbers can be kept for days, weeks, or indefinitely as long as you renew them."
    },
    {
        question: "Is my payment information secure?",
        answer: "Absolutely. We use industry-standard encryption for all transactions. We also do not store your credit card information directly. For maximum privacy, we accept various cryptocurrencies."
    },
    {
        question: "Can I receive calls?",
        answer: "Currently, our service focuses on SMS verification. Voice call functionality is in beta and available for specific country numbers on higher-tier plans."
    },
    {
        question: "Do you offer refunds?",
        answer: "Yes, if a number fails to receive an SMS code within the activation period, the credit is automatically refunded to your account balance."
    }
];

export default function FAQ() {
    return (
        <section id="faq" className="py-24">
            <div className="container mx-auto px-4 max-w-4xl">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">Frequently Asked Questions</h2>
                    <p className="text-lg text-muted-foreground">
                        Have questions? We're here to help.
                    </p>
                </div>

                <Accordion type="single" collapsible className="w-full">
                    {faqs.map((faq, index) => (
                        <AccordionItem key={index} value={`item-${index}`}>
                            <AccordionTrigger className="text-left text-lg font-medium">{faq.question}</AccordionTrigger>
                            <AccordionContent className="text-muted-foreground">
                                {faq.answer}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </div>
        </section>
    );
}
