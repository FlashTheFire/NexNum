// Email Design System V3: "README / Terminal"
// Aesthetic: Monospace, Neon Lime (#C6FF00), Charcoal (#101012), Badges.

export const colors = {
    bg: {
        root: 'transparent', // User requested: Don't force black bg
        surface: '#151518', // Slightly lighter charcoal
        code: '#000000', // Pure black for code blocks
    },
    text: {
        primary: '#FFFFFF', // White
        secondary: '#A1A1AA', // Gray-400
        tertiary: '#52525B', // Gray-600
        code: '#C6FF00', // Neon Lime Text
    },
    brand: {
        primary: '#C6FF00', // Neon Lime (Signature)
        secondary: '#0F2E2E', // Deep Teal
        accent: '#FF6B6B', // Red (Enterprise Badge)
    },
    border: {
        subtle: '#333333',
        highlight: '#C6FF00', // Lime Border
    }
}

export const typography = {
    fontFamily: {
        sans: '"JetBrains Mono", "SF Mono", "Menlo", monospace',
        heading: '"JetBrains Mono", "SF Mono", "Menlo", monospace',
    },
    size: {
        h1: '24px', // Smaller, more terminal-like
        h2: '20px',
        body: '14px',
        small: '12px',
        caption: '10px',
    },
    lineHeight: {
        relaxed: '1.6',
        tight: '1.2',
    },
    weight: {
        regular: '400',
        medium: '500',
        bold: '700',
    }
}

export const spacing = {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
}

export const borders = {
    radius: {
        card: '0px', // Sharp corners (Terminal window)
        button: '2px', // Slight rounding like badges
    },
    shadow: {
        // Hard shadows, no blur (Pixel/Retro feel)
        glowPrimary: '0 0 0 1px #C6FF00',
        card: 'none',
    }
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nexnum.io'

export const components = {
    main: {
        backgroundColor: '#ffffff',
        backgroundImage: 'url(https://i.ibb.co/Z17SBFvJ/download.jpg)', // User provided pattern
        fontFamily: '"Lato", "Helvetica Neue", helvetica, sans-serif',
        color: colors.text.primary,
        backgroundRepeat: 'repeat',
    },
    container: {
        maxWidth: '600px',
        margin: '0 auto',
        padding: '40px 0',
    },
    logo: {
        margin: '0 auto 32px',
        textAlign: 'center' as const,
        borderBottom: `1px dashed ${colors.border.subtle}`,
        paddingBottom: '24px',
    },
    card: {
        backgroundColor: colors.bg.surface,
        borderRadius: borders.radius.card,
        border: `1px solid ${colors.border.subtle}`,
        padding: '32px',
        // Terminal window effect
        boxShadow: '0 0 0 1px #333',
    },
    // Typography
    h1: {
        fontFamily: typography.fontFamily.heading,
        fontSize: typography.size.h1,
        fontWeight: typography.weight.bold,
        letterSpacing: '-0.5px',
        color: colors.brand.primary, // Lime Green Headers
        margin: '0 0 24px',
        textTransform: 'uppercase' as const, // CMD style
        textAlign: 'left' as const, // Terminals align left
    },
    text: {
        color: colors.text.secondary,
        fontSize: typography.size.body,
        lineHeight: typography.lineHeight.relaxed,
        margin: '0 0 20px',
        textAlign: 'left' as const,
    },
    // Buttons
    button: {
        primary: {
            backgroundColor: colors.brand.primary,
            color: '#000000', // Black text on Lime
            fontWeight: '700',
            fontSize: '14px',
            fontFamily: typography.fontFamily.sans,
            borderRadius: borders.radius.button,
            padding: '12px 24px',
            textDecoration: 'none',
            textTransform: 'uppercase' as const,
            textAlign: 'center' as const,
            display: 'inline-block',
            border: `1px solid ${colors.brand.primary}`,
        },
        ghost: {
            backgroundColor: 'transparent',
            color: colors.text.secondary,
            fontSize: '12px',
            textDecoration: 'none',
            fontFamily: typography.fontFamily.sans,
            border: `1px solid ${colors.border.subtle}`,
            padding: '8px 16px',
        }
    },
    footer: {
        marginTop: '32px',
        textAlign: 'center' as const,
        borderTop: `1px dashed ${colors.border.subtle}`,
        paddingTop: '24px',
    },
    footerText: {
        fontSize: typography.size.caption,
        color: colors.text.tertiary,
        fontFamily: typography.fontFamily.sans,
    }
}

