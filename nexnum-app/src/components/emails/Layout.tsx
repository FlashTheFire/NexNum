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
    Font,
    Tailwind,
} from '@react-email/components'
import { colors, components } from './theme'

interface EmailLayoutProps {
    preview?: string
    children: React.ReactNode
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.io'

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => {
    return (
        <Html>
            <Tailwind>
                <Head>
                    <Font
                        fontFamily="Rajdhani"
                        fallbackFontFamily="sans-serif"
                        webFont={{
                            url: 'https://fonts.gstatic.com/s/rajdhani/v15/LDIxapCSOBg7S-QT7q4A.woff2',
                            format: 'woff2',
                        }}
                        fontWeight={700}
                        fontStyle="normal"
                    />
                    <Font
                        fontFamily="Quantico"
                        fallbackFontFamily="sans-serif"
                        webFont={{
                            url: 'https://fonts.gstatic.com/s/quantico/v17/0VDFgS3Y44dJ8i9QY7tD52w.woff2',
                            format: 'woff2',
                        }}
                        fontWeight={700}
                        fontStyle="normal"
                    />
                    <Font
                        fontFamily="JetBrains Mono"
                        fallbackFontFamily="monospace"
                        webFont={{
                            url: 'https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0Pn5qRS8.woff2',
                            format: 'woff2',
                        }}
                        fontWeight={400}
                        fontStyle="normal"
                    />
                </Head>
                <Preview>{preview}</Preview>

                <Body style={components.main}>
                    <Container style={components.container}>
                        {/* Wrapper: Glass Card Surface containing EVERYTHING */}
                        <Section style={components.card}>
                            {/* 1. Centered Logo with Glow (Now Inside Card) */}
                            {/* 1. Centered Logo with Glow (Now Inside Card) */}
                            <Section style={{ ...components.logo, textAlign: 'center' }}>
                                <table align="center" border={0} cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: '0 auto' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ paddingRight: '16px', verticalAlign: 'middle' }}>
                                                {/* Logo Icon */}
                                                <img
                                                    src={`${baseUrl}/logos/nexnum-logo.svg`}
                                                    width="40"
                                                    height="40"
                                                    alt="NexNum"
                                                    style={{ display: 'block', maxWidth: '100%' }}
                                                />
                                            </td>
                                            <td style={{ verticalAlign: 'middle' }}>
                                                <Text
                                                    className="text-4xl sm:text-5xl" // Responsive
                                                    style={{
                                                        fontWeight: '700',
                                                        color: '#C6FF00',
                                                        margin: 0,
                                                        fontFamily: 'Rajdhani, sans-serif',
                                                        letterSpacing: '2px',
                                                        textTransform: 'uppercase',
                                                        textShadow: '0 0 15px rgba(198, 255, 0, 0.5)',
                                                        lineHeight: '1'
                                                    }}>
                                                    NEXNUM
                                                </Text>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </Section>

                            {/* 2. Content */}
                            {children}

                            {/* 3. Footer (Split Layout: Text Left, Icons Right) */}
                            <Section style={{
                                ...components.footer,
                                textAlign: 'left', // Override centered
                                paddingTop: '32px',
                                paddingBottom: '20px'
                            }}>
                                <table border={0} cellPadding="0" cellSpacing="0" width="100%" role="presentation">
                                    <tbody>
                                        <tr>
                                            {/* Column 1: Copyright & Links */}
                                            <td valign="top" width="60%" style={{ paddingRight: '20px' }}>
                                                <Text style={{ ...components.footerText, margin: 0, fontSize: '12px', lineHeight: '1.4' }}>
                                                    Copyright © {new Date().getFullYear()} NexNum Inc.
                                                    <br />
                                                    All rights reserved.
                                                </Text>
                                                <Text style={{ ...components.footerText, margin: '8px 0 0', fontSize: '12px' }}>
                                                    <Link href="#" style={{ color: colors.text.secondary, textDecoration: 'underline' }}>
                                                        Unsubscribe
                                                    </Link>
                                                </Text>
                                            </td>

                                            {/* Column 2: Social Icons (Right Aligned) */}
                                            <td valign="top" width="40%" align="right">
                                                <table border={0} cellPadding="0" cellSpacing="0" role="presentation">
                                                    <tbody>
                                                        <tr>
                                                            <td style={{ padding: '0 5px' }}>
                                                                <a href="https://facebook.com" target="_blank">
                                                                    <img src="https://postcards-cdn.designmodo.com/images-cdn/image-1711447129705-5ba94a32.png" width="15" height="15" alt="FB" style={{ display: 'block', border: 0 }} />
                                                                </a>
                                                            </td>
                                                            <td style={{ padding: '0 5px' }}>
                                                                <a href="https://twitter.com" target="_blank">
                                                                    <img src="https://postcards-cdn.designmodo.com/images-cdn/image-1711447131706-3e06aad8.png" width="15" height="15" alt="X" style={{ display: 'block', border: 0 }} />
                                                                </a>
                                                            </td>
                                                            <td style={{ padding: '0 5px' }}>
                                                                <a href="https://instagram.com" target="_blank">
                                                                    <img src="https://postcards-cdn.designmodo.com/images-cdn/image-1711447130706-b45c8ec7.png" width="15" height="15" alt="IG" style={{ display: 'block', border: 0 }} />
                                                                </a>
                                                            </td>
                                                            <td style={{ padding: '0 5px' }}>
                                                                <a href="https://youtube.com" target="_blank">
                                                                    <img src="https://postcards-cdn.designmodo.com/images-cdn/image-1711447132707-8c68b807.png" width="15" height="15" alt="YT" style={{ display: 'block', border: 0 }} />
                                                                </a>
                                                            </td>
                                                            <td style={{ padding: '0 5px' }}>
                                                                <a href="https://discord.com" target="_blank">
                                                                    <img src="https://postcards-cdn.designmodo.com/images-cdn/image-1711447128615-0a984bbb.png" width="15" height="15" alt="DS" style={{ display: 'block', border: 0 }} />
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </Section>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    )
}

export default EmailLayout
