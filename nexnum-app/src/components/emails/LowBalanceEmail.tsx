import {
    Button,
    Heading,
    Section,
    Text,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors } from './theme'

interface LowBalanceEmailProps {
    balance: number
    threshold: number
    name: string
}

export const LowBalanceEmail = ({ balance, threshold, name }: LowBalanceEmailProps) => {
    return (
        <EmailLayout preview="⚠️ Low Balance Alert">
            <Heading style={components.text.h1}>Low Balance Alert</Heading>

            <Text style={components.text.body}>
                Hi {name},
            </Text>

            <Text style={components.text.body}>
                Your wallet balance has dropped below your configured threshold of <strong>${threshold.toFixed(2)}</strong>.
            </Text>

            <Section style={balanceCard}>
                <Text style={balanceLabel}>Current Balance</Text>
                <Text style={balanceValue}>${balance.toFixed(2)}</Text>
            </Section>

            <Text style={components.text.body}>
                To avoid service interruption with your API usage or number rentals, please recharge your wallet soon.
            </Text>

            <Section style={styles.btnContainer}>
                <Button style={styles.button} href="https://neaxnum.io/dashboard/wallet">
                    Add Funds Now
                </Button>
            </Section>
        </EmailLayout>
    )
}

// Styles
const balanceCard = {
    background: colors.state.error.bg,
    border: `1px solid ${colors.state.error.border}`,
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center' as const,
    margin: '24px 0',
}

const balanceLabel = {
    color: colors.state.error.text,
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

const styles = {
    btnContainer: {
        textAlign: 'center' as const,
        margin: '32px 0 16px',
    },
    button: {
        ...components.button.primary,
        backgroundColor: colors.brand.accent,
        boxShadow: 'none',
    }
}

export default LowBalanceEmail
