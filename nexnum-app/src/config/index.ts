/**
 * Central Configuration Module
 * Re-exports all configuration from a single entry point
 */

// App configuration
export {
    AppConfig,
    LimitsConfig,
    TimeoutsConfig,
    WorkersConfig,
    FeaturesConfig,
    PricingConfig,
    SecurityConfig,
    type AppConfigType,
} from './app.config'

// Environment schema
export {
    envSchema,
    validateProductionRequirements,
    type Env,
} from './env.schema'

// Environment validation
export {
    validateEnv,
    validateEnvOnStartup,
    getEnv,
    getEnvRequired,
    getEnvNumber,
    getEnvBoolean,
    getTypedEnv,
    type ValidationResult,
} from './env.validation'
