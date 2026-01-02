import {
    Button,
    Heading,
    Section,
    Text,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors, spacing, typography } from './theme'

interface ApiKeyEmailProps {
    action: 'created' | 'revoked' | 'limit_reached'
    keyName: string
    keyPrefix?: string
}

export const ApiKeyEmail = ({ action, keyName, keyPrefix }: ApiKeyEmailProps) => {

    let title = ''
    let message = ''
    let buttonLabel = 'Go to Developer Dashboard'

    if (action === 'created') {
        title = 'New API Key Created'
        message = `A new API key "${keyName}" has been successfully created on your account.`
    } else if (action === 'revoked') {
        title = 'API Key Revoked'
        message = `The API key "${keyName}" has been revoked and can no longer be used.`
    } else {
        title = 'API Limit Reached'
        message = `Your API key "${keyName}" has reached its daily request limit.`
        buttonLabel = 'Upgrade Plan'
    }

    return (
        <EmailLayout preview={title}>
            <Heading style={components.text.h1}>{title}</Heading>

            <Text style={components.text.body}>{message}</Text>

            {action === 'created' && keyPrefix && (
                <Section style={codeBlock}>
                    <Text style={code}>
                        {keyPrefix}****************************
                    </Text>
                </Section>
            )}

            <Section style={styles.btnContainer}>
                <Button style={components.button.primary} href="https://neaxnum.io/dashboard/api">
                    {buttonLabel}
                </Button>
            </Section>
        </EmailLayout>
    )
}

const codeBlock = {
    backgroundColor: '#000000',
    border: `1px solid ${colors.neutral.border}`,
    borderRadius: '8px',
    padding: spacing.md,
    marginTop: spacing.md,
    textAlign: 'center' as const,
}

const code = {
    fontFamily: 'monospace',
    color: '#34d399', // Emerald code color
    fontSize: typography.size.body,
    letterSpacing: '2px',
    margin: 0,
}

const styles = {
    btnContainer: { textAlign: 'center' as const, marginTop: spacing.xl }
}

export default ApiKeyEmail
