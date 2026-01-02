import {
    Button,
    Heading,
    Section,
    Text,
} from '@react-email/components'
import EmailLayout from './Layout'

interface LowBalanceEmailProps {
    balance: number
    threshold: number
    name: string
}

export const LowBalanceEmail = ({ balance, threshold, name }: LowBalanceEmailProps) => {
    return (
        <EmailLayout preview="⚠️ Low Balance Alert">
            <Heading style={h1}>Low Balance Alert</Heading>

            <Text style={text}>
                Hi {name},
            </Text>

            <Text style={text}>
                Your wallet balance has dropped below your configured threshold of <strong>${threshold.toFixed(2)}</strong>.
            </Text>

            <Section style={balanceCard}>
                <Text style={balanceLabel}>Current Balance</Text>
                <Text style={balanceValue}>${balance.toFixed(2)}</Text>
            </Section>

            <Text style={text}>
                To avoid service interruption with your API usage or number rentals, please recharge your wallet soon.
            </Text>

            <Section style={btnContainer}>
                <Button style={button} href="https://neaxnum.io/dashboard/wallet">
                    Add Funds Now
                </Button>
            </Section>
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
    lineHeight: '24px',
    margin: '0 0 16px',
}

const balanceCard = {
    background: 'linear-gradient(to bottom right, #ef444420, #7f1d1d20)',
    border: '1px solid #ef444440',
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center' as const,
    margin: '24px 0',
}

const balanceLabel = {
    color: '#fca5a5', // red-300
    fontSize: '14px',
    fontWeight: '600',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    margin: '0',
}

const balanceValue = {
    color: '#ffffff',
    fontSize: '36px',
    fontWeight: '800',
    margin: '8px 0 0',
}

const btnContainer = {
    textAlign: 'center' as const,
    margin: '32px 0 16px',
}

const button = {
    backgroundColor: '#ef4444', // red-500
    borderRadius: '8px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '12px 24px',
}

export default LowBalanceEmail
