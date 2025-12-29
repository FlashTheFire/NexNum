"use client";

const services = [
    // Social Media
    "WhatsApp", "Telegram", "Instagram", "TikTok", "Facebook", "X / Twitter", "Snapchat", "Reddit", "Discord", "Pinterest", "YouTube", "LinkedIn", "Twitch", "WeChat", "Viber", "Signal", "Quora", "Medium",
    // Food & Delivery
    "DoorDash", "UberEats", "Grubhub", "Zomato", "Swiggy", "Deliveroo", "Postmates", "Instacart", "HelloFresh", "Just Eat", "Deliveroo", "Glovo", "Talabat", "Foodpanda",
    // Ecommerce
    "Amazon", "eBay", "Walmart", "Target", "Shopify", "AliExpress", "Zara", "H&M", "Nike", "Adidas", "Etsy", "Sephora", "Flipkart", "Myntra", "IKEA", "ASOS", "Shein", "Temu", "Mercado Libre", "Rakuten",
    // Technology & Others
    "Google", "Apple", "Microsoft", "Netflix", "Spotify", "PayPal", "Binance", "Airbnb", "Slack", "Zoom", "Adobe", "Steam", "ChatGPT", "Claude", "Gemini"
];

export default function ServiceTicker() {
    return (
        <div className="relative w-full py-2 bg-[#0a0a0c]/40 backdrop-blur-md border-y border-white/[0.04] overflow-hidden">
            {/* Gradient Mask for smooth fade edges */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#0a0a0c] to-transparent" />
                <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[#0a0a0c] to-transparent" />
            </div>

            {/* Pure CSS marquee animation for smooth GPU-accelerated scrolling */}
            <div
                className="flex items-center whitespace-nowrap w-fit animate-marquee"
                style={{
                    willChange: 'transform',
                }}
            >
                {/* Double the array for seamless looping */}
                {[...services, ...services].map((service, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-1.5 px-4 text-gray-500 font-medium text-[9px] md:text-[11px] tracking-tight uppercase group hover:text-white transition-colors duration-300"
                    >
                        <span className="text-[hsl(var(--neon-lime))] text-xs group-hover:scale-125 transition-transform duration-300">✓</span>
                        {service}
                    </div>
                ))}
            </div>
        </div>
    );
}
