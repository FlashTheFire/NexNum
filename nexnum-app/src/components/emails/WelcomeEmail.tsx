import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
    Link,
    Img,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors } from './theme'

interface WelcomeEmailProps {
    name: string
}

export const WelcomeEmail = ({ name }: WelcomeEmailProps) => {
    return (
        <EmailLayout preview="✨ Welcome to NexNum">
            {/* Header */}
            <Heading
                className="text-xl sm:text-2xl" // Responsive: 20px -> 24px
                style={{
                    ...components.h1,
                    // fontSize Removed in favor of className
                    marginBottom: '14px',
                    textAlign: 'left',
                    color: colors.brand.primary,
                    letterSpacing: '1px'
                }}>
                Welcome to NexNum
            </Heading>

            <Text style={{
                ...components.text,
                // fontFamily: Removed manually to use Theme Default (Sans/Mono)
                fontSize: '12px', // Standard readable size
                lineHeight: '1.6'
            }}>
                <strong>Your account is now active.</strong>
                <br />
                You have full access to our global SMS verification network.
                Securely fund your wallet and start renting numbers instantly.
            </Text>

            {/* CTA */}
            <Section style={{ textAlign: 'left', margin: '32px 0' }}>
                <Button
                    style={{
                        ...components.button.primary,
                        fontFamily: 'Quantico',
                        fontSize: '14px',
                        padding: '14px 32px',
                        letterSpacing: '1px',
                        textTransform: 'none',
                        borderRadius: '4px'
                    }}
                    href="https://nexnum.io/dashboard"
                >
                    Get Started 🚀
                </Button>
            </Section>

            <Hr style={{ borderColor: colors.border.subtle, margin: '32px 0' }} />

            {/* Quick Actions Grid (E-commerce Style) */}
            <Section style={{ marginTop: '32px' }}>
                <Text style={{ ...components.text, color: colors.text.primary, fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Quick Access
                </Text>

                <div style={{ display: 'block' }}> {/* Changed from grid to block for mobile safety */}

                    {/* Action 1: Wallet (Top Rounded) */}
                    <div style={{ ...actionCard, borderRadius: '12px 12px 0 0', borderBottom: 'none', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tr>
                                <td style={{ width: '100px', verticalAlign: 'middle' }}>
                                    <Img src="https://i.ibb.co/j9hcTVyW/download.png" width="80" height="80" alt="Wallet" style={{ borderRadius: '8px', display: 'block' }} />
                                </td>
                                <td style={{ verticalAlign: 'middle' }}>
                                    <Text style={actionTitle}>Fund Wallet</Text>
                                    <Text style={actionDesc}>Add balance to wallet.</Text>
                                    <Link href="https://nexnum.io/wallet" style={actionLink}>Top Up &rarr;</Link>
                                </td>
                            </tr>
                        </table>
                    </div>

                    {/* Action 2: Buy (Square) */}
                    <div style={{ ...actionCard, borderRadius: '0', borderBottom: 'none', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tr>
                                <td style={{ width: '100px', verticalAlign: 'middle' }}>
                                    <Img src="https://i.ibb.co/MyqdHHLY/download.png" width="80" height="80" alt="SIM" style={{ borderRadius: '8px', display: 'block' }} />
                                </td>
                                <td style={{ verticalAlign: 'middle' }}>
                                    <Text style={actionTitle}>Rent Numbers</Text>
                                    <Text style={actionDesc}> Instant verification.</Text>
                                    <Link href="https://nexnum.io/numbers" style={actionLink}>Browse &rarr;</Link>
                                </td>
                            </tr>
                        </table>
                    </div>

                    {/* Action 3: API (Square) */}
                    <div style={{ ...actionCard, borderRadius: '0', borderBottom: 'none', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tr>
                                <td style={{ width: '100px', verticalAlign: 'middle' }}>
                                    <Img src="https://i.ibb.co/VcrW7Q33/download.jpg" width="80" height="80" alt="API" style={{ borderRadius: '8px', display: 'block' }} />
                                </td>
                                <td style={{ verticalAlign: 'middle' }}>
                                    <Text style={actionTitle}>API Access</Text>
                                    <Text style={actionDesc}>Generate keys & docs.</Text>
                                    <Link href="https://nexnum.io/docs" style={actionLink}>Connect &rarr;</Link>
                                </td>
                            </tr>
                        </table>
                    </div>

                    {/* Action 4: Support (Bottom Rounded) */}
                    <div style={{ ...actionCard, borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tr>
                                <td style={{ width: '100px', verticalAlign: 'middle' }}>
                                    <Img src="https://i.ibb.co/MyqdHHLY/download.png" width="80" height="80" alt="Support" style={{ borderRadius: '8px', display: 'block' }} />
                                </td>
                                <td style={{ verticalAlign: 'middle' }}>
                                    <Text style={actionTitle}>24/7 Support</Text>
                                    <Text style={actionDesc}>Live agent assistance.</Text>
                                    <Link href="https://nexnum.io/support" style={actionLink}>Chat Now &rarr;</Link>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
            </Section>

            {/* Footer */}
            <Section style={{ marginTop: '48px', textAlign: 'center', opacity: 0.7 }}>
                <Text style={{
                    ...components.text,
                    fontSize: '12px',
                    textAlign: 'center',
                    color: colors.text.secondary,
                    fontStyle: 'italic',
                    fontFamily: 'Quantico'
                }}>
                    "Global Coverage. Instant Delivery. Zero Compromise."
                </Text>
            </Section>

        </EmailLayout>
    )
}

// Clean Futuristic Box
const hudBox = {
    backgroundColor: 'rgba(198, 255, 0, 0.05)', // Very subtle lime tint
    border: '1px solid rgba(198, 255, 0, 0.2)',
    padding: '16px 8px',
    textAlign: 'center' as const,
    marginBottom: '8px'
}

const hudValue = {
    color: colors.brand.primary,
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0 0 4px 0',
    fontFamily: 'Quantico',
    textShadow: `0 0 10px ${colors.brand.primary}40`
}

const hudLabel = {
    color: colors.text.secondary,
    fontSize: '10px',
    letterSpacing: '2px',
    margin: 0,
    fontFamily: 'Quantico',
    opacity: 0.8
}

const actionCard = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: '0px', // Sharp corners as requested
    padding: '16px',
    textAlign: 'left' as const,
}

const actionIcon = {
    fontSize: '24px', // Larger icon
    margin: 0,
    lineHeight: '1',
}

const actionTitle = {
    color: colors.text.primary,
    fontSize: '15px', // Reverted to old size
    fontWeight: '700',
    margin: '0 0 6px',
    fontFamily: 'Rajdhani, sans-serif', // Matching Brand Font
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
}

const actionDesc = {
    color: colors.text.secondary,
    fontSize: '12px', // Reverted to old size
    margin: '0 0 8px',
    fontFamily: components.main.fontFamily, // Default Sans (Clean)
    lineHeight: '1.4',
    whiteSpace: 'nowrap' as const, // Force one line
    overflow: 'hidden',
    textOverflow: 'ellipsis'
}

const actionLink = {
    color: colors.brand.primary,
    fontSize: '12px',
    fontWeight: 'bold',
    textDecoration: 'none',
}

export default WelcomeEmail
