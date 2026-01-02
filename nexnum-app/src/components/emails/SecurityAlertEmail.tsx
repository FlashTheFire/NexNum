import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors, spacing, typography } from './theme'

interface SecurityAlertEmailProps {
    type: 'login' | 'password_changed' | 'unusual_activity'
    ip: string
    location?: string
    device?: string
    time: string
}

export const SecurityAlertEmail = ({
    type, ip, location, device, time
}: SecurityAlertEmailProps) => {

    const isLogin = type === 'login'
    const title = isLogin ? 'New Sign-in Detected' :
        type === 'password_changed' ? 'Password Changed' :
            'Unusual Activity Detected'

    return (
        <EmailLayout preview={`Security Alert: ${title}`}>
            <Heading style={components.text.h1}>{title}</Heading>

            <Text style={components.text.body}>
                We detected a new sign-in to your NexNum account.
            </Text>

            <Section style={alertCard}>
                <div style={row}>
                    <Text style={label}>Device</Text>
                    <Text style={value}>{device || 'Unknown Device'}</Text>
                </div>
                <Hr style={divider} />
                <div style={row}>
                    <Text style={label}>Location</Text>
                    <Text style={value}>{location || 'Unknown Location'}</Text>
                </div>
                <Hr style={divider} />
                <div style={row}>
                    <Text style={label}>IP Address</Text>
                    <Text style={value}>{ip}</Text>
                </div>
                <Hr style={divider} />
                <div style={row}>
                    <Text style={label}>Time</Text>
                    <Text style={value}>{time}</Text>
                </div>
            </Section>

            <Text style={components.text.body}>
                If this was you, you can safely ignore this email. If you don't recognize this activity, please check your security settings immediately.
            </Text>

            <Section style={styles.btnContainer}>
                <Button style={styles.button} href="https://neaxnum.io/dashboard/settings/security">
                    Review Security
                </Button>
            </Section>
        </EmailLayout>
    )
}

const alertCard = {
    backgroundColor: colors.state.warning.bg, // Amber bg
    border: `1px solid ${colors.state.warning.border}`,
    borderRadius: '12px',
    padding: spacing.md,
    marginBottom: spacing.lg,
}

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }

const label = {
    color: colors.state.warning.text,
    fontSize: typography.size.small,
    margin: 0,
    fontWeight: 500
}

const value = {
    color: colors.neutral.text.primary,
    fontSize: typography.size.small,
    margin: 0,
    textAlign: 'right' as const,
    fontWeight: typography.weight.bold
}

const divider = { borderColor: colors.state.warning.border, margin: '12px 0' }

const styles = {
    btnContainer: { textAlign: 'center' as const, marginTop: spacing.xl },
    button: { ...components.button.primary, backgroundColor: colors.neutral.card, border: `1px solid ${colors.neutral.border}` } // Subtle button for checking
}

export default SecurityAlertEmail
