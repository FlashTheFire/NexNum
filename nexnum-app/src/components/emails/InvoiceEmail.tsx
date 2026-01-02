import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors, spacing, typography, borders } from './theme'

interface InvoiceEmailProps {
    invoiceId: string
    amount: number
    currency: string
    date: string
    items: Array<{ description: string, amount: number }>
}

export const InvoiceEmail = ({
    invoiceId, amount, currency = 'USD', date, items
}: InvoiceEmailProps) => {
    return (
        <EmailLayout preview={`New Invoice #${invoiceId}`}>
            <Heading style={components.text.h1}>Invoice Ready</Heading>

            <Text style={components.text.body}>
                A new invoice has been generated for your account.
                Total amount due: <strong>{currency} {amount.toFixed(2)}</strong>.
            </Text>

            <Section style={styles.invoiceMeta}>
                <div style={styles.row}>
                    <Text style={styles.label}>Invoice ID</Text>
                    <Text style={styles.value}>#{invoiceId}</Text>
                </div>
                <div style={styles.row}>
                    <Text style={styles.label}>Date</Text>
                    <Text style={styles.value}>{date}</Text>
                </div>
            </Section>

            <Section style={styles.table}>
                <div style={styles.tableHeader}>
                    <Text style={styles.th}>Description</Text>
                    <Text style={{ ...styles.th, textAlign: 'right' }}>Amount</Text>
                </div>
                <Hr style={styles.divider} />

                {items.map((item, i) => (
                    <div key={i} style={styles.itemRow}>
                        <Text style={styles.td}>{item.description}</Text>
                        <Text style={{ ...styles.td, textAlign: 'right' }}>
                            {currency} {item.amount.toFixed(2)}
                        </Text>
                    </div>
                ))}

                <Hr style={styles.divider} />
                <div style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{currency} {amount.toFixed(2)}</Text>
                </div>
            </Section>

            <Section style={styles.btnContainer}>
                <Button style={components.button.primary} href={`https://neaxnum.io/dashboard/billing/${invoiceId}`}>
                    View & Pay Invoice
                </Button>
            </Section>
        </EmailLayout>
    )
}

const styles = {
    invoiceMeta: {
        backgroundColor: colors.neutral.bg,
        border: borders.style.default,
        borderRadius: borders.radius.md,
        padding: spacing.md,
        marginBottom: spacing.lg,
    },
    row: { display: 'flex', justifyContent: 'space-between', marginBottom: spacing.xs },
    label: { color: colors.neutral.text.tertiary, fontSize: typography.size.small, margin: 0 },
    value: { color: colors.neutral.text.primary, fontSize: typography.size.small, margin: 0, fontWeight: 500 },

    table: { marginBottom: spacing.xl },
    tableHeader: { display: 'flex', justifyContent: 'space-between' },
    th: { color: colors.neutral.text.tertiary, fontSize: typography.size.caption, textTransform: 'uppercase' as const, letterSpacing: '1px', fontWeight: 600, margin: 0 },
    divider: { borderColor: colors.neutral.border, margin: '8px 0' },
    itemRow: { display: 'flex', justifyContent: 'space-between', margin: '4px 0' },
    td: { color: colors.neutral.text.secondary, fontSize: typography.size.small, margin: 0 },

    totalRow: { display: 'flex', justifyContent: 'space-between', marginTop: spacing.sm },
    totalLabel: { color: colors.neutral.text.primary, fontWeight: 700, fontSize: typography.size.body },
    totalValue: { color: colors.brand.primary, fontWeight: 700, fontSize: typography.size.h3, margin: 0 },

    btnContainer: { textAlign: 'center' as const }
}

export default InvoiceEmail
