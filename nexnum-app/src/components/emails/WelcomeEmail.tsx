import {
    Button,
    Heading,
    Section,
    Text,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components } from './theme'

interface WelcomeEmailProps {
    name: string
}

export const WelcomeEmail = ({ name }: WelcomeEmailProps) => {
    return (
        <EmailLayout preview="Welcome to NexNum!">
            <Heading style={components.text.h1}>Welcome aboard, {name}! 🚀</Heading>

            <Text style={components.text.body}>
                We're excited to have you join NexNum. You now have access to the world's most advanced digital number platform.
            </Text>

            <Section style={featureList}>
                <Text style={featureItem}>✅ Instant SMS Verification</Text>
                <Text style={featureItem}>✅ Real-time Numbers from 150+ Countries</Text>
                <Text style={featureItem}>✅ Secure & Private Transactions</Text>
            </Section>

            <Text style={components.text.body}>
                Ready to get started? Top up your wallet and generate your first number in seconds.
            </Text>

            <Section style={btnContainer}>
                <Button style={components.button.primary} href="https://neaxnum.io/dashboard/wallet">
                    Add Funds & Start
                </Button>
            </Section>

            <Text style={components.text.caption}>
                If you have any questions, our support team is available 24/7 via the dashboard.
            </Text>
        </EmailLayout>
    )
}

// Local Overrides/Specifics
const featureList = {
    margin: '20px 0',
    backgroundColor: 'rgba(51, 65, 85, 0.3)', // slate-700/30
    padding: '16px',
    borderRadius: '8px',
}

const featureItem = {
    ...components.text.body,
    margin: '8px 0',
    fontWeight: '500',
}

const btnContainer = {
    textAlign: 'center' as const,
    margin: '30px 0',
}

export default WelcomeEmail
