interface JsonLdProps {
    data?: Record<string, any>
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.in'

export default function JsonLd({ data }: JsonLdProps) {
    const socialLinks = [
        'https://x.com/TheNexNum',
        'https://github.com/nexnum',
        'https://discord.gg/fZs296Kgue',
        'https://www.instagram.com/thenexnum',
        'https://www.youtube.com/@TheNexNum'
    ]

    const defaultJsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'NexNum',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Any',
            description: 'Secure, private virtual numbers for SMS verification. Instant activation and global coverage.',
            url: baseUrl,
            offers: {
                '@type': 'Offer',
                price: '0.00',
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock'
            },
            aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                ratingCount: '1250'
            }
        },
        {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'NexNum',
            alternateName: ['NexNum', 'nexnum', 'NexNum SMS', 'nexnum.in'],
            url: baseUrl,
            logo: `${baseUrl}/icon.svg`,
            sameAs: socialLinks,
            description: 'NexNum is the leading provider of virtual phone numbers and SMS verification services worldwide.'
        },
        {
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: 'NexNum',
            description: 'Virtual phone numbers for OTP verification and SMS verification in India.',
            url: baseUrl,
            logo: `${baseUrl}/icon.svg`,
            priceRange: '₹₹',
            address: {
                '@type': 'PostalAddress',
                addressCountry: 'IN'
            },
            areaServed: {
                '@type': 'Country',
                name: 'India'
            },
            paymentAccepted: ['UPI', 'Credit Card', 'Debit Card', 'Net Banking'],
            openingHours: 'Mo-Su 00:00-23:59'
        },
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'NexNum',
            alternateName: ['NexNum Platform', 'nexnum.in'],
            url: baseUrl,
            potentialAction: {
                '@type': 'SearchAction',
                target: `${baseUrl}/en?q={search_term_string}`,
                'query-input': 'required name=search_term_string'
            }
        }
    ]

    const content = data || defaultJsonLd

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(content) }}
        />
    )
}
