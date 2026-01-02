// Premium Email Design Tokens
// "Tone: premium, confident, minimal, functional"

export const colors = {
    // Brand Colors
    brand: {
        primary: '#8b5cf6', // Violet-500
        secondary: '#3b82f6', // Blue-500
        accent: '#f43f5e', // Rose-500 (Urgent/Alert)
    },
    // Neutrals (Dark Mode First)
    neutral: {
        bg: '#0f172a', // Slate-900 (Main Background)
        card: '#1e293b', // Slate-800 (Content Card)
        border: '#334155', // Slate-700
        text: {
            primary: '#f8fafc', // Slate-50 (H1, Strong)
            secondary: '#cbd5e1', // Slate-300 (Body)
            tertiary: '#94a3b8', // Slate-400 (Footer, Caption)
            muted: '#64748b', // Slate-500
        }
    },
    // States
    state: {
        success: {
            bg: 'rgba(16, 185, 129, 0.1)',
            text: '#34d399', // Emerald-400
            border: 'rgba(16, 185, 129, 0.2)',
        },
        warning: {
            bg: 'rgba(245, 158, 11, 0.1)',
            text: '#fbbf24', // Amber-400
            border: 'rgba(245, 158, 11, 0.2)',
        },
        error: {
            bg: 'rgba(239, 68, 68, 0.1)',
            text: '#f87171', // Red-400
            border: 'rgba(239, 68, 68, 0.2)',
        },
        info: {
            bg: 'rgba(59, 130, 246, 0.1)',
            text: '#60a5fa', // Blue-400
            border: 'rgba(59, 130, 246, 0.2)',
        }
    }
}

export const typography = {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
    size: {
        h1: '28px',
        h2: '24px',
        h3: '20px',
        body: '16px',
        small: '14px',
        caption: '12px',
        tiny: '10px',
    },
    lineHeight: {
        tight: '1.25',
        base: '1.6',
        loose: '2.0',
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
        sm: '4px',
        md: '8px',
        lg: '12px',
        full: '9999px',
    },
    style: {
        default: `1px solid ${colors.neutral.border}`,
    }
}

// Reusable component styles based on tokens
export const components = {
    container: {
        maxWidth: '600px',
        margin: '0 auto',
        padding: `${spacing.lg} 0 ${spacing.xxl}`,
    },
    card: {
        backgroundColor: colors.neutral.card,
        borderRadius: borders.radius.lg,
        border: borders.style.default,
        padding: spacing.lg,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
    button: {
        primary: {
            backgroundColor: colors.brand.primary,
            borderRadius: borders.radius.md,
            color: '#ffffff',
            fontSize: typography.size.body,
            fontWeight: typography.weight.bold,
            textDecoration: 'none',
            textAlign: 'center' as const,
            display: 'inline-block',
            padding: `${spacing.md} ${spacing.lg}`,
            boxShadow: '0 4px 14px 0 rgba(139, 92, 246, 0.39)',
        },
        secondary: {
            backgroundColor: 'transparent',
            borderRadius: borders.radius.md,
            color: colors.neutral.text.secondary,
            border: `1px solid ${colors.neutral.border}`,
            fontSize: typography.size.body,
            fontWeight: typography.weight.medium,
            textDecoration: 'none',
            textAlign: 'center' as const,
            display: 'inline-block',
            padding: `${spacing.md} ${spacing.lg}`,
        }
    },
    header: {
        padding: `${spacing.lg} 0`,
        textAlign: 'center' as const,
    },
    footer: {
        padding: `${spacing.lg} 0`,
        textAlign: 'center' as const,
    },
    text: {
        h1: {
            color: colors.neutral.text.primary,
            fontSize: typography.size.h1,
            fontWeight: typography.weight.bold,
            margin: '0 0 24px',
            textAlign: 'center' as const,
        },
        body: {
            color: colors.neutral.text.secondary,
            fontSize: typography.size.body,
            lineHeight: typography.lineHeight.base,
            margin: '0 0 16px',
        },
        caption: {
            color: colors.neutral.text.tertiary,
            fontSize: typography.size.caption,
        }
    }
}
