import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors, spacing } from './theme'

interface TransactionEmailProps {
    type: 'deposit' | 'purchase'
    amount: number
    currency: string
    referenceId: string
    date: string
    description: string
}

export const TransactionEmail = ({
    type,
    amount,
    currency = 'USD',
    referenceId,
    date,
    description
}: TransactionEmailProps) => {
    const isDeposit = type === 'deposit'
    const symbol = isDeposit ? '+' : '-'
    const color = isDeposit ? colors.state.success.text : colors.state.error.text

    return (
        <EmailLayout preview={`Transaction Receipt: ${currency} ${amount.toFixed(2)}`}>
            <Heading style={components.text.h1}>
                {isDeposit ? 'Payment Received' : 'Order Confirmation'}
            </Heading>

            <Section style={amountContainer}>
                <Text style={{ ...amountText, color }}>
                    {symbol}{currency} {amount.toFixed(2)}
                </Text>
                <Text style={statusText}>Successful</Text>
            </Section>

            <Text style={{ ...components.text.body, textAlign: 'center' }}>
                Here is the receipt for your recent transaction on NexNum.
            </Text>

            <Section style={detailsContainer}>
                <div style={row}>
                    <Text style={label}>Reference ID</Text>
                    <Text style={value}>{referenceId}</Text>
                </div>
                <Hr style={divider} />
                <div style={row}>
                    <Text style={label}>Date</Text>
                    <Text style={value}>{date}</Text>
                </div>
                <Hr style={divider} />
                <div style={row}>
                    <Text style={label}>Description</Text>
                    <Text style={value}>{description}</Text>
                </div>
            </Section>

            <Section style={styles.btnContainer}>
                <Button style={components.button.secondary} href="https://neaxnum.io/dashboard/history">
                    View Transaction
                </Button>
            </Section>
        </EmailLayout>
    )
}

// Styles
const amountContainer = {
    textAlign: 'center' as const,
    marginBottom: spacing.xl,
}

const amountText = {
    fontSize: '36px',
    fontWeight: '800',
    margin: '0',
}

const statusText = {
    color: colors.neutral.text.tertiary,
    fontSize: '14px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    marginTop: '4px',
}

const detailsContainer = {
    backgroundColor: 'rgba(51, 65, 85, 0.2)',
    borderRadius: '8px',
    padding: spacing.md,
    marginBottom: spacing.lg,
}

const row = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
}

const label = {
    color: colors.neutral.text.tertiary,
    fontSize: '14px',
    margin: '0',
}

const value = {
    color: colors.neutral.text.primary,
    fontSize: '14px',
    fontWeight: '500',
    margin: '0',
    textAlign: 'right' as const,
}

const divider = {
    borderColor: colors.neutral.border,
    margin: '12px 0',
}

const styles = {
    btnContainer: { textAlign: 'center' as const }
}

export default TransactionEmail
