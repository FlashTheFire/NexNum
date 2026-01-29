import {
    Button,
    Heading,
    Section,
    Text,
    Img,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors, spacing, typography } from './theme'

interface ApiKeyEmailProps {
    name: string
    action: 'created' | 'revoked' | 'limit_reached'
    keyName: string
    keyPrefix?: string
}

export const ApiKeyEmail = ({ name, action, keyName, keyPrefix }: ApiKeyEmailProps) => {

    let title = ''
    let message = ''
    let iconUrl = "https://i.ibb.co/VcrW7Q33/download.jpg" // API icon

    if (action === 'created') {
        title = 'API Access Authorized'
        message = `A new entry point has been established. Your API key "${keyName}" is now active.`
    } else if (action === 'revoked') {
        title = 'API Access Revoked'
        message = `The security protocol for key "${keyName}" has been terminated.`
    } else {
        title = 'Global Limit Reached'
        message = `Your integration "${keyName}" has reached its daily data ceiling.`
    }

    return (
        <EmailLayout preview={title}>
            <Heading
                style={{
                    ...components.h1,
                    color: colors.brand.primary,
                    fontFamily: 'Rajdhani, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }}>
                {title}
            </Heading>

            <Text style={{ ...components.text, color: colors.text.secondary }}>
                Hello <strong>{name}</strong>,
                <br />
                {message}
            </Text>

            <Section style={actionCard}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tr>
                        <td style={{ width: '140px', verticalAlign: 'middle' }}>
                            <Img src={iconUrl} width="120" height="120" style={{ borderRadius: '16px', display: 'block' }} />
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                            <Text style={actionTitle}>
                                {keyName.toUpperCase()}
                            </Text>
                            {action === 'created' && keyPrefix && (
                                <Section style={codeHighlight}>
                                    <Text style={codeText}>
                                        {keyPrefix}*****************
                                    </Text>
                                </Section>
                            )}
                            <Button
                                style={{
                                    ...components.button.primary,
                                    marginTop: '16px',
                                    borderRadius: '8px',
                                    fontFamily: 'Quantico'
                                }}
                                href="https://nexnum.io/dashboard/api"
                            >
                                Manage Protocol &rarr;
                            </Button>
                        </td>
                    </tr>
                </table>
            </Section>

            <Section style={{ marginTop: '32px', textAlign: 'center' }}>
                <Text style={{ ...components.text, fontSize: '11px', color: colors.text.tertiary }}>
                    🛡️ Secured by NexNum Industrial Encryption
                </Text>
            </Section>
        </EmailLayout>
    )
}

const actionCard = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: '16px',
    padding: '24px',
    marginTop: '24px',
}

const actionTitle = {
    color: colors.text.primary,
    fontSize: '14px',
    fontWeight: '700',
    margin: '0 0 8px',
    fontFamily: 'Rajdhani, sans-serif',
    letterSpacing: '1px'
}

const codeHighlight = {
    backgroundColor: 'rgba(198, 255, 0, 0.05)',
    padding: '8px 12px',
    borderRadius: '4px',
    border: `1px solid rgba(198, 255, 0, 0.1)`
}

const codeText = {
    color: colors.brand.primary,
    fontFamily: 'monospace',
    fontSize: '12px',
    margin: 0,
}

export default ApiKeyEmail
