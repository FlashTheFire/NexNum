import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
    Img,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors } from './theme'

interface SecurityAlertEmailProps {
    name: string
    type: 'login' | 'password_changed' | 'unusual_activity'
    ip: string
    location?: string
    device?: string
    time: string
}

export const SecurityAlertEmail = ({
    name, type, ip, location, device, time
}: SecurityAlertEmailProps) => {

    const isLogin = type === 'login'
    const title = isLogin ? 'Access Alert' :
        type === 'password_changed' ? 'Security Update' :
            'Activity Alert'

    const iconUrl = "https://i.ibb.co/VcrW7Q33/download.jpg" // Security icon

    return (
        <EmailLayout preview={`Security Alert: ${title}`}>
            <Heading
                style={{
                    ...components.h1,
                    color: colors.brand.accent, // Use accent for alerts
                    fontFamily: 'Rajdhani, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }}>
                {title}
            </Heading>

            <Text style={{ ...components.text, color: colors.text.secondary }}>
                Hello <strong>{name}</strong>,
                <br />
                A new security event was detected on your account. If this was not you, please take action immediately.
            </Text>

            <Section style={alertCard}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tr>
                        <td style={{ width: '140px', verticalAlign: 'middle' }}>
                            <Img src={iconUrl} width="120" height="120" style={{ borderRadius: '16px', display: 'block' }} />
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                            <Text style={eventTitle}>
                                {type.replace('_', ' ').toUpperCase()}
                            </Text>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tr>
                                    <td style={labelCell}>DEVICE</td>
                                    <td style={valueCell}>{device || 'Unknown'}</td>
                                </tr>
                                <tr>
                                    <td style={labelCell}>LOCATION</td>
                                    <td style={valueCell}>{location || 'Unknown'}</td>
                                </tr>
                                <tr>
                                    <td style={labelCell}>IP ADDR</td>
                                    <td style={valueCell}>{ip}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </Section>

            <Section style={{ textAlign: 'center', marginTop: '32px' }}>
                <Button
                    style={{
                        ...components.button.primary,
                        backgroundColor: colors.text.primary,
                        color: colors.bg.surface,
                        borderRadius: '8px',
                        padding: '12px 24px',
                        fontFamily: 'Quantico'
                    }}
                    href="https://nexnum.io/dashboard/settings/security"
                >
                    Secure Account &rarr;
                </Button>
            </Section>
        </EmailLayout>
    )
}

const alertCard = {
    backgroundColor: 'rgba(255,107,107,0.05)', // Subtle Red tint
    border: `1px solid rgba(255,107,107,0.2)`,
    borderRadius: '16px',
    padding: '24px',
    marginTop: '24px',
}

const eventTitle = {
    color: colors.text.primary,
    fontSize: '14px',
    fontWeight: '700',
    margin: '0 0 12px',
    fontFamily: 'Rajdhani, sans-serif',
    letterSpacing: '1px'
}

const labelCell = {
    color: colors.text.tertiary,
    fontSize: '9px',
    fontWeight: 'bold',
    padding: '2px 0',
}

const valueCell = {
    color: colors.text.secondary,
    fontSize: '10px',
    textAlign: 'right' as const,
    padding: '2px 0',
    fontFamily: 'monospace'
}

export default SecurityAlertEmail
