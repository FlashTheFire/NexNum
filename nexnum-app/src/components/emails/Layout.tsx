import * as React from 'react'
import {
    Body,
    Container,
    Head,
    Html,
    Link,
    Preview,
    Section,
    Text,
    Hr,
    Font,
} from '@react-email/components'
import { colors, components, spacing, typography } from './theme'

interface EmailLayoutProps {
    preview?: string
    children: React.ReactNode
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.io'

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => {
    return (
        <Html>
            <Head>
                <Font
                    fontFamily="Roboto"
                    fallbackFontFamily="Verdana"
                    webFont={{
                        url: 'https://fonts.gstatic.com/s/roboto/v27/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2',
                        format: 'woff2',
                    }}
                    fontWeight={400}
                    fontStyle="normal"
                />
            </Head>
            <Preview>{preview}</Preview>
            <Body style={styles.main}>
                <Container style={components.container}>
                    {/* Header */}
                    <Section style={components.header}>
                        <div style={styles.logoContainer}>
                            <Text style={styles.logoText}>NexNum</Text>
                        </div>
                    </Section>

                    {/* Content Card */}
                    <Section style={components.card}>
                        {children}
                    </Section>

                    {/* Footer */}
                    <Section style={components.footer}>
                        <Text style={components.text.caption}>
                            © {new Date().getFullYear()} NexNum. All rights reserved.
                        </Text>
                        <Text style={styles.footerLinks}>
                            <Link href={`${baseUrl}/dashboard`} style={styles.link}>Dashboard</Link>
                            <span style={{ margin: '0 8px', color: colors.neutral.text.tertiary }}>•</span>
                            <Link href={`${baseUrl}/terms`} style={styles.link}>Terms</Link>
                            <span style={{ margin: '0 8px', color: colors.neutral.text.tertiary }}>•</span>
                            <Link href={`${baseUrl}/privacy`} style={styles.link}>Privacy</Link>
                        </Text>
                        <Text style={components.text.caption}>
                            You are receiving this email because you are a registered user of NexNum.
                            <br />
                            <Link href={`${baseUrl}/settings/notifications`} style={{ ...styles.link, color: colors.neutral.text.muted }}>
                                Unsubscribe
                            </Link>
                            {' '}from generic updates.
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    )
}

const styles = {
    main: {
        backgroundColor: colors.neutral.bg,
        fontFamily: typography.fontFamily,
        color: colors.neutral.text.primary,
    },
    logoContainer: {
        display: 'inline-block',
        padding: `${spacing.sm} ${spacing.lg}`,
        background: `linear-gradient(to right, ${colors.brand.primary}, ${colors.brand.secondary})`,
        borderRadius: '8px',
    },
    logoText: {
        color: '#ffffff',
        fontSize: '24px',
        fontWeight: 'bold',
        letterSpacing: '-0.5px',
        margin: 0,
    },
    footerLinks: {
        fontSize: typography.size.caption,
        color: colors.neutral.text.tertiary,
        margin: `${spacing.md} 0`,
    },
    link: {
        color: colors.brand.primary,
        textDecoration: 'none',
    }
}

export default EmailLayout
