interface JsonLdProps {
    data?: Record<string, any>
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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
            url: baseUrl,
            logo: `${baseUrl}/assets/brand/nexnum-logo.svg`,
            sameAs: socialLinks
        },
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'NexNum',
            url: baseUrl,
            potentialAction: {
                '@type': 'SearchAction',
                target: `${baseUrl}/search?q={search_term_string}`,
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
