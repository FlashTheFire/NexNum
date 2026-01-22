
import 'dotenv/config'
import fs from 'fs'
import path from 'path'

function validate() {
    console.log('🔐 Validating Environment Secrets...')

    // 1. Read .env.example keys
    const examplePath = path.join(process.cwd(), '.env.example')
    if (!fs.existsSync(examplePath)) {
        console.warn('⚠️ .env.example not found. Skipping completeness check.')
        return
    }

    const exampleContent = fs.readFileSync(examplePath, 'utf-8')
    const requiredKeys = exampleContent
        .split('\n')
        .map(line => line.split('=')[0].trim())
        .filter(key => key && !key.startsWith('#'))

    const missing: string[] = []

    for (const key of requiredKeys) {
        if (!process.env[key]) {
            missing.push(key)
        }
    }

    if (missing.length > 0) {
        console.error('❌ Missing Required Environment Variables:')
        missing.forEach(k => console.error(`   - ${k}`))
        process.exit(1)
    }

    // 2. Format Validation
    const checks = [
        { key: 'DATABASE_URL', pattern: /^postgres(ql)?:\/\//, msg: 'Must be a PostgreSQL URL' },
        { key: 'REDIS_URL', pattern: /^rediss?:\/\//, msg: 'Must be a Redis URL' },
        { key: 'NEXTAUTH_URL', pattern: /^https?:\/\//, msg: 'Must be a valid URL' },
        { key: 'ENCRYPTION_KEY', pattern: /.+/, msg: 'Must be non-empty' },
    ]

    let hasFormatError = false
    for (const check of checks) {
        const val = process.env[check.key]
        if (val && !check.pattern.test(val)) {
            console.error(`❌ Invalid Format: ${check.key} - ${check.msg}`)
            hasFormatError = true
        }
    }

    if (hasFormatError) {
        process.exit(1)
    }

    console.log('✅ Secrets Integrity Check Passed.')
    process.exit(0)
}

validate()
