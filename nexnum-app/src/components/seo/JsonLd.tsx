interface JsonLdProps {
    data?: Record<string, any>
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export default function JsonLd({ data }: JsonLdProps) {
    const defaultJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'NexNum',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        description: 'Secure, private virtual numbers for SMS verification. Instant activation and global coverage.',
        url: baseUrl,
        offers: {
            '@type': 'Offer',
            price: '0.50',
            priceCurrency: 'USD',
            availability: 'https://schema.org/InStock'
        },
        aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: '4.8',
            ratingCount: '1250'
        }
    }

    const content = data || defaultJsonLd

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(content) }}
        />
    )
}
