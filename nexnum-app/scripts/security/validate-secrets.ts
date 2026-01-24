
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const REQUIRED_KEYS = [
    'DATABASE_URL',
    'ENCRYPTION_KEY',
    'NEXTAUTH_SECRET',
    'REDIS_URL'
]

const OPTIONAL_KEYS = [
    'DATABASE_READ_URL',
    'NEXT_PUBLIC_APP_URL'
]

let hasError = false

console.log('\n🔐 Validating Secrets...\n')

// 1. Check existence
REQUIRED_KEYS.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ Missing required env var: ${key}`)
        hasError = true
    } else {
        console.log(`✅ ${key} is set`)
    }
})

// 2. Check Encryption Key Format
const encKey = process.env.ENCRYPTION_KEY
if (encKey) {
    if (encKey.length !== 64) {
        // Warn but don't fail for legacy support unless strict mode
        console.warn(`⚠️  ENCRYPTION_KEY should ideally be a 64-char hex string (currently ${encKey.length} chars)`)
        // hasError = true // Uncomment to enforce strict mode
    } else if (!/^[0-9a-fA-F]+$/.test(encKey)) {
        console.error('❌ ENCRYPTION_KEY must be a valid hex string')
        hasError = true
    }
}

// 3. Check Database URL Protocol
const dbUrl = process.env.DATABASE_URL
if (dbUrl && !dbUrl.startsWith('postgres')) {
    console.error('❌ DATABASE_URL must start with postgres:// or postgresql://')
    hasError = true
}

console.log('')

if (hasError) {
    console.error('🛑 Secrets validation failed. Please fix .env file.')
    process.exit(1)
}

console.log('✨ All secrets valid!')
process.exit(0)
