// Environment Validation
// Validates required environment variables on startup

const REQUIRED_ENV_VARS = [
    // Core
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'NEXTAUTH_SECRET',

    // Email
    'RESEND_API_KEY',
    'FROM_EMAIL',

    // OAuth (at least one should be configured for production)
    // These are validated individually in their respective files

    // Security
    'CSRF_SECRET',

    // App URLs
    'NEXT_PUBLIC_APP_URL',
    'NEXTAUTH_URL'
];

const OPTIONAL_BUT_RECOMMENDED = [
    'REDIS_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS'
];

export function validateEnvironment() {
    const missing = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}. ` +
            `Please check your .env file.`
        );
    }

    // Validate NODE_ENV
    const validNodeEnvs = ['development', 'production', 'test'];
    if (process.env.NODE_ENV && !validNodeEnvs.includes(process.env.NODE_ENV)) {
        console.warn(
            `Warning: NODE_ENV is set to '${process.env.NODE_ENV}'. ` +
            `Expected one of: ${validNodeEnvs.join(', ')}`
        );
    }

    // Warn about missing recommended vars
    const missingRecommended = OPTIONAL_BUT_RECOMMENDED.filter(
        varName => !process.env[varName]
    );

    if (missingRecommended.length > 0) {
        console.warn(
            `Warning: Recommended environment variables not set: ${missingRecommended.join(', ')}. ` +
            `Some features may not work correctly.`
        );
    }

    // Validate email configuration in production
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is required in production');
        }

        if (!process.env.FROM_EMAIL) {
            throw new Error('FROM_EMAIL is required in production');
        }

        // Basic email format validation
        const emailMatch = process.env.FROM_EMAIL.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        if (!emailMatch) {
            console.warn(
                'Warning: FROM_EMAIL does not appear to be a valid email address. ' +
                'This may affect email deliverability.'
            );
        }
    }

    console.log('✅ Environment validation passed');
}

// Auto-validate when imported (in production)
if (process.env.NODE_ENV === 'production') {
    validateEnvironment();
}