import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
} from '@react-email/components'
import EmailLayout from './Layout'

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
    const color = isDeposit ? '#10b981' : '#ef4444' // Emerald or Red

    return (
        <EmailLayout preview={`Transaction Receipt: ${currency} ${amount.toFixed(2)}`}>
            <Heading style={h1}>
                {isDeposit ? 'Payment Received' : 'Order Confirmation'}
            </Heading>

            <Section style={amountContainer}>
                <Text style={{ ...amountText, color }}>
                    {symbol}{currency} {amount.toFixed(2)}
                </Text>
                <Text style={statusText}>Successful</Text>
            </Section>

            <Text style={text}>
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

            <Section style={btnContainer}>
                <Button style={button} href="https://neaxnum.io/dashboard/history">
                    View Transaction
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
    margin: '0 0 24px',
}

const text = {
    color: '#cbd5e1',
    fontSize: '16px',
    textAlign: 'center' as const,
    margin: '0 0 24px',
}

const amountContainer = {
    textAlign: 'center' as const,
    marginBottom: '32px',
}

const amountText = {
    fontSize: '36px',
    fontWeight: '800',
    margin: '0',
}

const statusText = {
    color: '#94a3b8',
    fontSize: '14px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    marginTop: '4px',
}

const detailsContainer = {
    backgroundColor: '#33415520',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
}

const row = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
}

const label = {
    color: '#94a3b8', // slate-400
    fontSize: '14px',
    margin: '0',
}

const value = {
    color: '#e2e8f0', // slate-200
    fontSize: '14px',
    fontWeight: '500',
    margin: '0',
    textAlign: 'right' as const,
}

const divider = {
    borderColor: '#334155',
    margin: '12px 0',
}

const btnContainer = {
    textAlign: 'center' as const,
}

const button = {
    backgroundColor: '#334155',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '12px 24px',
    border: '1px solid #475569',
}

export default TransactionEmail
