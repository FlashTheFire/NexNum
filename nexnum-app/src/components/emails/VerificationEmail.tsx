import {
    Heading,
    Section,
    Text,
} from '@react-email/components'
import EmailLayout from './Layout'

interface VerificationEmailProps {
    code: string
}

export const VerificationEmail = ({ code }: VerificationEmailProps) => {
    return (
        <EmailLayout preview={`Your verification code is ${code}`}>
            <Heading style={h1}>Verify Your Identity</Heading>

            <Text style={text}>
                Please use the following code to complete your verification request.
                This code will expire in 10 minutes.
            </Text>

            <Section style={codeContainer}>
                <Text style={codeText}>{code}</Text>
            </Section>

            <Text style={subtext}>
                If you didn't request this code, you can safely ignore this email.
                Investigate your account activity if you're concerned about security.
            </Text>
        </EmailLayout>
    )
}

// Styles
const h1 = {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    margin: '0 0 20px',
}

const text = {
    color: '#cbd5e1',
    fontSize: '16px',
    textAlign: 'center' as const,
    margin: '0 0 24px',
}

const codeContainer = {
    background: 'rgba(139, 92, 246, 0.1)',
    border: '1px solid rgba(139, 92, 246, 0.2)',
    borderRadius: '12px',
    margin: '16px auto',
    width: 'fit-content',
    padding: '4px 32px',
    textAlign: 'center' as const,
}

const codeText = {
    color: '#a78bfa', // violet-400
    fontSize: '32px',
    fontWeight: '700',
    letterSpacing: '8px',
    fontFamily: 'monospace',
    margin: '16px 0',
}

const subtext = {
    color: '#64748b',
    fontSize: '13px',
    textAlign: 'center' as const,
    marginTop: '24px',
}

export default VerificationEmail
