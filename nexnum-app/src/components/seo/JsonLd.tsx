export default function JsonLd() {
    const schema = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": "https://nexnum.com/#organization",
                "name": "NexNum",
                "url": "https://nexnum.com",
                "logo": {
                    "@type": "ImageObject",
                    "url": "https://nexnum.com/logo.png",
                    "width": 512,
                    "height": 512
                },
                "sameAs": [
                    "https://twitter.com/NexNumApp",
                    "https://github.com/NexNum"
                ]
            },
            {
                "@type": "SoftwareApplication",
                "name": "NexNum Premium Verification",
                "applicationCategory": "BusinessApplication",
                "operatingSystem": "Any",
                "offers": {
                    "@type": "Offer",
                    "price": "0.10",
                    "priceCurrency": "USD",
                    "availability": "https://schema.org/InStock"
                },
                "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.8",
                    "ratingCount": "8540",
                    "bestRating": "5",
                    "worstRating": "1"
                },
                "featureList": "Virtual Phone Numbers, SMS Verification, OTP Bypass, API Access",
                "screenshot": "https://nexnum.com/og-image.jpg"
            },
            {
                "@type": "WebSite",
                "@id": "https://nexnum.com/#website",
                "url": "https://nexnum.com",
                "name": "NexNum",
                "publisher": {
                    "@id": "https://nexnum.com/#organization"
                }
            }
        ]
    }

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
    )
}
