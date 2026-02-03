
import { redis } from '@/lib/core/redis'
import { decrypt } from '@/lib/security/encryption'

const AUTH_SETTINGS_KEY = 'system:auth_settings'

export interface OAuthProviderConfig {
    clientId: string
    clientSecret: string
    enabled: boolean
}

export async function getOAuthSettings(provider: 'google' | 'github' | 'discord' | 'twitter' | 'facebook'): Promise<OAuthProviderConfig> {
    // 1. Defaults from Env
    const envKey = provider.toUpperCase()
    const config: OAuthProviderConfig = {
        clientId: process.env[`${envKey}_CLIENT_ID`] || '',
        clientSecret: process.env[`${envKey}_CLIENT_SECRET`] || '',
        enabled: !!(process.env[`${envKey}_CLIENT_ID`] && process.env[`${envKey}_CLIENT_SECRET`])
    }

    try {
        // 2. Overrides from Redis
        const stored = await redis.get(AUTH_SETTINGS_KEY)
        const settings = stored ? JSON.parse(stored) : null

        if (settings?.oauth?.[provider]) {
            const remote = settings.oauth[provider]

            // Enable/Disable override
            if (typeof remote.enabled === 'boolean') {
                config.enabled = remote.enabled
            }

            // Client ID override
            if (remote.clientId) {
                config.clientId = remote.clientId
            }

            // Client Secret override (Decrypted)
            if (remote.clientSecret) {
                config.clientSecret = decrypt(remote.clientSecret)
            }
        }
    } catch (error) {
        console.error(`Failed to fetch OAuth settings for ${provider}`, error)
    }

    return config
}
