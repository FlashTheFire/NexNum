import * as React from 'react'
import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text,
    Hr,
} from '@react-email/components'

interface EmailLayoutProps {
    preview?: string
    children: React.ReactNode
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => {
    return (
        <Html>
            <Head />
            <Preview>{preview}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={header}>
                        <div style={logoContainer}>
                            <span style={logoText}>NexNum</span>
                        </div>
                    </Section>

                    {/* Content */}
                    <Section style={content}>
                        {children}
                    </Section>

                    {/* Footer */}
                    <Section style={footer}>
                        <Hr style={hr} />
                        <Text style={footerText}>
                            © {new Date().getFullYear()} NexNum. All rights reserved.
                        </Text>
                        <Text style={footerLinks}>
                            <Link href={`${baseUrl}/dashboard`} style={link}>Dashboard</Link> •{' '}
                            <Link href={`${baseUrl}/terms`} style={link}>Terms</Link> •{' '}
                            <Link href={`${baseUrl}/privacy`} style={link}>Privacy</Link>
                        </Text>
                        <Text style={footerAddress}>
                            123 Tech Street, Silicon Valley, CA 94025
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    )
}

// Styles
const main = {
    backgroundColor: '#0f172a', // slate-900
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
    color: '#e2e8f0',
}

const container = {
    margin: '0 auto',
    padding: '20px 0 48px',
    maxWidth: '580px',
}

const header = {
    padding: '20px',
    textAlign: 'center' as const,
}

const logoContainer = {
    display: 'inline-block',
    padding: '10px 20px',
    background: 'linear-gradient(to right, #8b5cf6, #3b82f6)',
    borderRadius: '8px',
}

const logoText = {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    letterSpacing: '-0.5px',
    fontFamily: 'sans-serif',
}

const content = {
    padding: '24px',
    backgroundColor: '#1e293b', // slate-800
    borderRadius: '12px',
    border: '1px solid #334155',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
}

const footer = {
    padding: '24px',
    textAlign: 'center' as const,
}

const footerText = {
    fontSize: '12px',
    color: '#94a3b8', // slate-400
    marginBottom: '10px',
}

const footerLinks = {
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '10px',
}

const footerAddress = {
    fontSize: '10px',
    color: '#64748b', // slate-500
}

const link = {
    color: '#8b5cf6', // violet-500
    textDecoration: 'none',
}

const hr = {
    borderColor: '#334155',
    margin: '20px 0',
}

export default EmailLayout
