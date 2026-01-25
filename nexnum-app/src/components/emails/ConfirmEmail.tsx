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

interface ConfirmEmailProps {
    name: string
    confirmLink: string
}

export const ConfirmEmail = ({ name, confirmLink }: ConfirmEmailProps) => {
    return (
        <EmailLayout preview="Confirm your specific email address">
            <Heading style={components.h1}>Confirm Your Email</Heading>

            <Text style={components.text}>
                Hi {name},
            </Text>

            <Text style={components.text}>
                Please confirm your email address to unlock full access to your NexNum account.
                Get started with the world's most advanced digital number platform.
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
                <Button
                    style={components.button.primary}
                    href={confirmLink}
                >
                    Confirm Email Address
                </Button>
            </Section>

            <Text style={{ ...components.text, fontSize: '12px', color: colors.text.tertiary, textAlign: 'center' }}>
                Or copy this link:
                <br />
                <Link href={confirmLink} style={{ color: colors.brand.primary }}>
                    {confirmLink}
                </Link>
            </Text>

            <Hr style={{ borderColor: colors.border.subtle, margin: '24px 0' }} />

            <Text style={{ ...components.text, fontSize: '12px', color: colors.text.tertiary, textAlign: 'center' }}>
                Link valid for 48 hours.
            </Text>
        </EmailLayout>
    )
}

export default ConfirmEmail
