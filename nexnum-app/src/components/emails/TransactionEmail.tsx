import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
    Img,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors } from './theme'

interface TransactionEmailProps {
    name: string
    type: 'deposit' | 'purchase'
    amount: number
    currency: string
    referenceId: string
    date: string
    description: string
}

export const TransactionEmail = ({
    name,
    type,
    amount,
    currency = 'USD',
    referenceId,
    date,
    description
}: TransactionEmailProps) => {
    const isDeposit = type === 'deposit'
    const symbol = isDeposit ? '+' : '-'
    const accentColor = isDeposit ? '#C6FF00' : '#FF6B6B'
    const iconUrl = isDeposit ? "https://i.ibb.co/j9hcTVyW/download.png" : "https://i.ibb.co/MyqdHHLY/download.png"

    return (
        <EmailLayout preview={`Transaction Receipt: ${currency} ${amount.toFixed(2)}`}>
            <Heading
                style={{
                    ...components.h1,
                    color: colors.brand.primary,
                    fontFamily: 'Rajdhani, sans-serif',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }}>
                {isDeposit ? 'Protocol Funded' : 'Order Confirmed'}
            </Heading>

            <Text style={{ ...components.text, color: colors.text.secondary }}>
                Hello <strong>{name}</strong>,
                <br />
                Your recent transaction has been processed and verified on the network.
            </Text>

            <Section style={receiptCard}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tr>
                        <td style={{ width: '140px', verticalAlign: 'middle' }}>
                            <Img src={iconUrl} width="120" height="120" style={{ borderRadius: '16px', display: 'block' }} />
                        </td>
                        <td style={{ verticalAlign: 'middle' }}>
                            <Text style={{
                                margin: '0',
                                color: colors.text.primary,
                                fontWeight: 'bold',
                                fontSize: '24px',
                                fontFamily: 'Quantico'
                            }}>
                                {symbol}{currency} {amount.toFixed(2)}
                            </Text>
                            <Text style={{ margin: '0', color: colors.text.tertiary, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                Transaction Successful
                            </Text>
                        </td>
                    </tr>
                </table>

                <Hr style={{ borderColor: 'rgba(255,255,255,0.05)', margin: '20px 0' }} />

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tr>
                        <td style={labelCell}>REFERENCE</td>
                        <td style={valueCell}>{referenceId}</td>
                    </tr>
                    <tr>
                        <td style={labelCell}>TIMESTAMP</td>
                        <td style={valueCell}>{date}</td>
                    </tr>
                    <tr>
                        <td style={labelCell}>DESCRIPTION</td>
                        <td style={valueCell}>{description}</td>
                    </tr>
                </table>
            </Section>

            <Section style={{ textAlign: 'center', marginTop: '32px' }}>
                <Button
                    style={{
                        ...components.button.primary,
                        borderRadius: '8px',
                        padding: '12px 24px',
                        fontFamily: 'Quantico'
                    }}
                    href="https://nexnum.io/dashboard/history"
                >
                    View History &rarr;
                </Button>
            </Section>
        </EmailLayout>
    )
}

const receiptCard = {
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: '16px',
    padding: '32px',
    marginTop: '24px',
}

const labelCell = {
    color: colors.text.tertiary,
    fontSize: '10px',
    fontWeight: 'bold',
    padding: '4px 0',
    fontFamily: 'Rajdhani, sans-serif'
}

const valueCell = {
    color: colors.text.secondary,
    fontSize: '11px',
    textAlign: 'right' as const,
    padding: '4px 0',
    fontFamily: 'monospace'
}

export default TransactionEmail
