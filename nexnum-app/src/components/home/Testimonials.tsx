import { Star } from "lucide-react";
import Image from "next/image";

const testimonials = [
    {
        name: "Alex Jensen",
        role: "Freelance Developer",
        content: "NexNum has been a game-changer for my testing workflow. Instant access to numbers from multiple countries saved me hours of waiting.",
        stars: 5,
        avatar: "/avatars/alex.jpg" // Placeholder path
    },
    {
        name: "Sarah Chen",
        role: "Digital Marketer",
        content: "I manage multiple social media accounts for clients. NexNum makes verification seamless and secure. Highly recommended!",
        stars: 5,
        avatar: "/avatars/sarah.jpg" // Placeholder path
    },
    {
        name: "Michael Ross",
        role: "Privacy Advocate",
        content: "Finally a service that respects privacy. Being able to pay with crypto and get a clean number instantly is exactly what I needed.",
        stars: 5,
        avatar: "/avatars/michael.jpg" // Placeholder path
    }
];

export default function Testimonials() {
    return (
        <section id="testimonials" className="py-24 bg-muted/30">
            <div className="container mx-auto px-4">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">Trusted by thousands</h2>
                    <p className="text-lg text-muted-foreground">
                        See what our users have to say about NexNum.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {testimonials.map((testimonial, index) => (
                        <div key={index} className="bg-background p-8 rounded-2xl border flex flex-col">
                            <div className="flex mb-4">
                                {[...Array(testimonial.stars)].map((_, i) => (
                                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                                ))}
                            </div>
                            <p className="text-muted-foreground flex-1 mb-6 italic">
                                "{testimonial.content}"
                            </p>
                            <div className="flex items-center">
                                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center mr-4 font-bold text-primary">
                                    {testimonial.name[0]}
                                </div>
                                <div>
                                    <h4 className="font-semibold">{testimonial.name}</h4>
                                    <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
