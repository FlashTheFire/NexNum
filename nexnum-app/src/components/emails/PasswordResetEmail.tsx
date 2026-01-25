import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
    Link,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors } from './theme'

interface PasswordResetEmailProps {
    name: string
    resetLink: string
}

export const PasswordResetEmail = ({ name, resetLink }: PasswordResetEmailProps) => {
    return (
        <EmailLayout preview="Reset your NexNum password">
            <Heading style={components.h1}>Reset Password</Heading>

            <Text style={components.text}>
                Hi {name},
            </Text>

            <Text style={components.text}>
                We received a request to reset your password. If you didn't make this request, you can safely ignore this email.
                Your account is secure.
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
                <Button
                    style={components.button.primary}
                    href={resetLink}
                >
                    Reset My Password
                </Button>
            </Section>

            <Text style={{ ...components.text, fontSize: '12px', color: colors.text.tertiary, textAlign: 'center' }}>
                Or copy this link:
                <br />
                <Link href={resetLink} style={{ color: colors.brand.primary }}>
                    {resetLink}
                </Link>
            </Text>

            <Hr style={{ borderColor: colors.border.subtle, margin: '24px 0' }} />

            <Text style={{ ...components.text, fontSize: '12px', color: colors.text.tertiary, textAlign: 'center' }}>
                Valid for 30 minutes.
            </Text>
        </EmailLayout>
    )
}

export default PasswordResetEmail
