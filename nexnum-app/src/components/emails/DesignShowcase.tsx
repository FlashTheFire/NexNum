import {
    Button,
    Heading,
    Section,
    Text,
    Hr,
} from '@react-email/components'
import EmailLayout from './Layout'
import { components, colors } from './theme'

export const DesignShowcase = () => {
    return (
        <EmailLayout preview="NexNum V4 Final - Tactical HUD">
            {/* Header */}
            <Heading style={{ ...components.h1, fontSize: '20px', letterSpacing: '4px' }}>
                TACTICAL_UPDATE //
            </Heading>

            {/* Intro */}
            <Text style={components.text}>
                <span style={{ color: colors.brand.primary, fontFamily: 'Quantico', fontSize: '16px' }}>
                    IDENTITY: CONFIRMED
                </span>
                <br /><br />
                Font: <strong>Quantico (Tactical HUD)</strong>
                <br />
                Status: <strong>Operational</strong>
            </Text>

            {/* Feature Grid / Cards */}
            <Section>
                <div style={{
                    border: `1px solid ${colors.brand.primary}`,
                    backgroundColor: 'rgba(198, 255, 0, 0.05)',
                    padding: '24px',
                    position: 'relative'
                }}>
                    {/* HUD Corners */}
                    <span style={{ position: 'absolute', top: 0, left: 0, width: '8px', height: '8px', borderTop: `2px solid ${colors.brand.primary}`, borderLeft: `2px solid ${colors.brand.primary}` }}></span>
                    <span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', borderTop: `2px solid ${colors.brand.primary}`, borderRight: `2px solid ${colors.brand.primary}` }}></span>
                    <span style={{ position: 'absolute', bottom: 0, left: 0, width: '8px', height: '8px', borderBottom: `2px solid ${colors.brand.primary}`, borderLeft: `2px solid ${colors.brand.primary}` }}></span>
                    <span style={{ position: 'absolute', bottom: 0, right: 0, width: '8px', height: '8px', borderBottom: `2px solid ${colors.brand.primary}`, borderRight: `2px solid ${colors.brand.primary}` }}></span>

                    <Text style={{
                        margin: 0,
                        color: colors.brand.primary,
                        fontFamily: 'Quantico',
                        fontSize: '18px',
                        textTransform: 'uppercase'
                    }}>
                        SECURE_CHANNEL_ESTABLISHED
                    </Text>
                    <Text style={{ margin: '12px 0 0', color: colors.text.secondary }}>
                        Encryption protocols active. Data integrity verified.
                    </Text>
                </div>
            </Section>

            {/* Primary Action */}
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
                <Button
                    style={{
                        ...components.button.primary,
                        fontFamily: 'Quantico',
                        fontSize: '16px',
                        padding: '16px 32px',
                        letterSpacing: '2px'
                    }}
                    href="https://nexnum.io"
                >
                    ENTER SYSTEM
                </Button>
            </Section>

        </EmailLayout>
    )
}

export default DesignShowcase
