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

interface ConfirmEmailProps {
    name: string
    confirmLink: string
}

export const ConfirmEmail = ({ name, confirmLink }: ConfirmEmailProps) => {
    return (
        <EmailLayout preview="✨ One last step to unlock your NexNum account">
            {/* Hero / Header Section */}
            <Heading
                className="text-2xl sm:text-3xl"
                style={{
                    ...components.h1,
                    marginBottom: '8px',
                    textAlign: 'left',
                    color: colors.brand.primary,
                    fontFamily: 'Rajdhani, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }}>
                Verify Your Identity
            </Heading>

            <Text style={{
                ...components.text,
                fontSize: '14px',
                lineHeight: '1.6',
                color: colors.text.secondary
            }}>
                Hello <strong>{name}</strong>,
                <br />
                We're excited to have you on board. To start accessing our global network of digital numbers, please verify your email address.
            </Text>

            {/* Main Action Card (Premium Style) */}
            <Section style={mainActionCard}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tr>
                        <td style={{ width: '140px', verticalAlign: 'middle' }}>
                            <Img
                                src="https://i.ibb.co/VcrW7Q33/download.jpg"
                                width="120"
                                height="120"
                                alt="Security"
                                style={{ borderRadius: '16px', display: 'block' }}
                            />
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                            <Text style={{
                                margin: '0 0 4px 0',
                                color: colors.text.primary,
                                fontWeight: 'bold',
                                fontSize: '16px',
                                fontFamily: 'Rajdhani, sans-serif'
                            }}>
                                ACTIVATE ACCOUNT
                            </Text>
                            <Text style={{
                                margin: '0 0 16px 0',
                                color: colors.text.secondary,
                                fontSize: '13px',
                                lineHeight: '1.4'
                            }}>
                                Securely confirm your email to enable deposits and number rentals.
                            </Text>
                            <Button
                                style={{
                                    ...components.button.primary,
                                    margin: '0',
                                    display: 'inline-block',
                                    padding: '12px 24px',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontFamily: 'Quantico, sans-serif'
                                }}
                                href={confirmLink}
                            >
                                Confirm Email &rarr;
                            </Button>
                        </td>
                    </tr>
                </table>
            </Section>

            <Hr style={{ borderColor: colors.border.subtle, margin: '32px 0' }} />

            {/* Why NexNum Section (Reinforcing Brand) */}
            <Section>
                <Text style={{
                    ...components.text,
                    color: colors.text.primary,
                    fontWeight: 'bold',
                    fontSize: '14px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    marginBottom: '16px',
                    fontFamily: 'Rajdhani, sans-serif'
                }}>
                    What's waiting for you
                </Text>

                <div style={quickBenefit}>
                    <Text style={benefitTitle}>🌍 Global Coverage</Text>
                    <Text style={benefitDesc}>Access numbers from 150+ countries instantly.</Text>
                </div>

                <div style={quickBenefit}>
                    <Text style={benefitTitle}>⚡ Instant Delivery</Text>
                    <Text style={benefitDesc}>Get your verification codes in real-time.</Text>
                </div>
            </Section>

            {/* Link Safety Area */}
            <Section style={{ marginTop: '32px', backgroundColor: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: `1px solid ${colors.border.subtle}` }}>
                <Text style={{ ...components.text, fontSize: '11px', color: colors.text.tertiary, marginBottom: '4px' }}>
                    Trouble with the button? Copy this link:
                </Text>
                <Link href={confirmLink} style={{ color: colors.brand.primary, fontSize: '10px', textDecoration: 'underline', wordBreak: 'break-all' }}>
                    {confirmLink}
                </Link>
            </Section>

            {/* Minimalist Footer */}
            <Section style={{ marginTop: '48px', textAlign: 'center', opacity: 0.6 }}>
                <Text style={{
                    ...components.text,
                    fontSize: '11px',
                    textAlign: 'center',
                    color: colors.text.secondary,
                    fontStyle: 'italic',
                    fontFamily: 'Quantico, sans-serif'
                }}>
                    "Global Coverage. Instant Delivery. Zero Compromise."
                </Text>
            </Section>
        </EmailLayout>
    )
}

// Brand Styles
const mainActionCard = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: '16px',
    padding: '32px',
    marginTop: '24px',
}

const quickBenefit = {
    marginBottom: '12px',
    padding: '12px',
    backgroundColor: 'rgba(198, 255, 0, 0.02)',
    borderLeft: `3px solid ${colors.brand.primary}`,
    borderRadius: '4px'
}

const benefitTitle = {
    color: colors.text.primary,
    fontSize: '15px',
    fontWeight: 'bold',
    margin: '0 0 4px 0',
    fontFamily: 'Rajdhani, sans-serif',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
}

const benefitDesc = {
    color: colors.text.secondary,
    fontSize: '12px',
    margin: 0,
    lineHeight: '1.4'
}

export default ConfirmEmail
