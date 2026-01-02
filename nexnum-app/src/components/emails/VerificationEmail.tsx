import {
    Heading,
    Section,
    Text,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors, typography } from './theme'

interface VerificationEmailProps {
    code: string
}

export const VerificationEmail = ({ code }: VerificationEmailProps) => {
    return (
        <EmailLayout preview={`Your verification code is ${code}`}>
            <Heading style={components.text.h1}>Verify Your Identity</Heading>

            <Text style={components.text.body}>
                Please use the following code to complete your verification request.
                This code will expire in 10 minutes.
            </Text>

            <Section style={codeContainer}>
                <Text style={codeText}>{code}</Text>
            </Section>

            <Text style={components.text.caption}>
                If you didn't request this code, you can safely ignore this email.
                Investigate your account activity if you're concerned about security.
            </Text>
        </EmailLayout>
    )
}

// Styles
const codeContainer = {
    background: 'rgba(139, 92, 246, 0.1)',
    border: `1px solid ${colors.brand.primary}40`, // 40 = ~25% opacity
    borderRadius: '12px',
    margin: '24px auto',
    width: 'fit-content',
    padding: '12px 48px',
    textAlign: 'center' as const,
}

const codeText = {
    color: colors.brand.primary,
    fontSize: '32px',
    fontWeight: typography.weight.bold,
    letterSpacing: '8px',
    fontFamily: 'monospace',
    margin: '0',
}

export default VerificationEmail
