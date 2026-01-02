import {
    Button,
    Heading,
    Section,
    Text,
} from '@react-email/components'
import EmailLayout from './Layout'

interface WelcomeEmailProps {
    name: string
}

export const WelcomeEmail = ({ name }: WelcomeEmailProps) => {
    return (
        <EmailLayout preview="Welcome to NexNum!">
            <Heading style={h1}>Welcome aboard, {name}! 🚀</Heading>

            <Text style={text}>
                We're excited to have you join NexNum. You now have access to the world's most advanced digital number platform.
            </Text>

            <Section style={featureList}>
                <Text style={featureItem}>✅ Instant SMS Verification</Text>
                <Text style={featureItem}>✅ Real-time Numbers from 150+ Countries</Text>
                <Text style={featureItem}>✅ Secure & Private Transactions</Text>
            </Section>

            <Text style={text}>
                Ready to get started? Top up your wallet and generate your first number in seconds.
            </Text>

            <Section style={btnContainer}>
                <Button style={button} href="https://neaxnum.io/dashboard/wallet">
                    Add Funds & Start
                </Button>
            </Section>

            <Text style={subtext}>
                If you have any questions, our support team is available 24/7 via the dashboard.
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
    color: '#cbd5e1', // slate-300
    fontSize: '16px',
    lineHeight: '24px',
    margin: '0 0 20px',
}

const subtext = {
    color: '#94a3b8', // slate-400
    fontSize: '14px',
    marginTop: '20px',
}

const featureList = {
    margin: '20px 0',
    backgroundColor: '#33415550',
    padding: '16px',
    borderRadius: '8px',
}

const featureItem = {
    color: '#e2e8f0',
    fontSize: '14px',
    margin: '8px 0',
    fontWeight: '500',
}

const btnContainer = {
    textAlign: 'center' as const,
    margin: '30px 0',
}

const button = {
    backgroundColor: '#8b5cf6',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '12px 24px',
    boxShadow: '0 4px 14px 0 rgba(139, 92, 246, 0.39)',
}

export default WelcomeEmail
