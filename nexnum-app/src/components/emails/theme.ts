// Email Design System V3: "README / Terminal"
// Aesthetic: Monospace, Neon Lime (#C6FF00), Charcoal (#101012), Badges.

export const colors = {
    bg: {
        root: 'transparent',
        surface: '#151518',
        code: '#000000',
    },
    text: {
        primary: '#FFFFFF',
        secondary: '#A1A1AA',
        tertiary: '#52525B',
        code: '#C6FF00',
    },
    brand: {
        primary: '#C6FF00',
        secondary: '#0F2E2E',
        accent: '#FF6B6B',
    },
    border: {
        subtle: '#333333',
        highlight: '#C6FF00',
    },
    neutral: {
        bg: '#151518',
        card: '#1a1a1d',
        border: '#333333',
        text: {
            primary: '#FFFFFF',
            secondary: '#A1A1AA',
            tertiary: '#52525B',
        }
    },
    state: {
        success: { bg: '#052e16', border: '#166534', text: '#4ade80' },
        error: { bg: '#450a0a', border: '#b91c1c', text: '#f87171' },
        warning: { bg: '#451a03', border: '#d97706', text: '#fbbf24' },
    }
}

export const typography = {
    fontFamily: {
        sans: '"JetBrains Mono", "SF Mono", "Menlo", monospace',
        heading: '"JetBrains Mono", "SF Mono", "Menlo", monospace',
    },
    size: {
        h1: '24px',
        h2: '20px',
        h3: '18px',
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
        card: '0px',
        button: '2px',
        md: '8px',
    },
    style: {
        default: `1px solid #333333`,
    },
    shadow: {
        glowPrimary: '0 0 0 1px #C6FF00',
        card: 'none',
    }
}

export const components = {
    main: {
        backgroundColor: '#ffffff',
        backgroundImage: 'url(https://i.ibb.co/Z17SBFvJ/download.jpg)',
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
        boxShadow: '0 0 0 1px #333',
    },
    h1: {
        fontFamily: typography.fontFamily.heading,
        fontSize: typography.size.h1,
        fontWeight: typography.weight.bold,
        letterSpacing: '-0.5px',
        color: colors.brand.primary,
        margin: '0 0 24px',
        textTransform: 'uppercase' as const,
        textAlign: 'left' as const,
    },
    text: {
        h1: {
            fontFamily: typography.fontFamily.heading,
            fontSize: typography.size.h1,
            fontWeight: typography.weight.bold,
            color: colors.brand.primary,
            margin: '0 0 24px',
            textAlign: 'left' as const,
        },
        body: {
            color: colors.text.secondary,
            fontSize: typography.size.body,
            lineHeight: typography.lineHeight.relaxed,
            margin: '0 0 20px',
            textAlign: 'left' as const,
        },
        caption: {
            fontSize: typography.size.caption,
            color: colors.text.tertiary,
            fontFamily: typography.fontFamily.sans,
            margin: '0',
            textAlign: 'left' as const,
        },
        color: colors.text.secondary,
        fontSize: typography.size.body,
        lineHeight: typography.lineHeight.relaxed,
        margin: '0 0 20px',
        textAlign: 'left' as const,
    },
    button: {
        primary: {
            backgroundColor: colors.brand.primary,
            color: '#000000',
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
        secondary: {
            backgroundColor: 'transparent',
            color: colors.text.primary,
            fontWeight: '600',
            fontSize: '14px',
            fontFamily: typography.fontFamily.sans,
            borderRadius: borders.radius.button,
            padding: '12px 24px',
            textDecoration: 'none',
            textAlign: 'center' as const,
            display: 'inline-block',
            border: `1px solid ${colors.border.subtle}`,
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
