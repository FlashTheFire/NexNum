
import { encrypt, decrypt } from '@/lib/security/encryption'

function run() {
    console.log('🔐 Verifying Encryption Utility...')

    const secret = 'my-super-secret-api-key-123'

    // 1. Roundtrip
    const encrypted = encrypt(secret)
    console.log('   Ciphertext:', encrypted)

    // Should be format iv:tag:content
    if (!encrypted.includes(':') || encrypted.split(':').length !== 3) {
        console.error('❌ Invalid format')
        process.exit(1)
    }

    const decrypted = decrypt(encrypted)
    if (decrypted === secret) {
        console.log('✅ Roundtrip SUCCESS')
    } else {
        console.error('❌ Roundtrip FAILED. Got:', decrypted)
        process.exit(1)
    }

    // 2. Different IVs
    const encrypted2 = encrypt(secret)
    if (encrypted !== encrypted2) {
        console.log('✅ Random IV Check: Passed (Ciphertexts differ)')
    } else {
        console.error('❌ Random IV Check: FAILED (Ciphertexts identical)')
    }

    // 3. Legacy/Plain check
    const legacy = 'plain-text-key'
    const decryptedLegacy = decrypt(legacy)
    if (decryptedLegacy === legacy) {
        console.log('✅ Legacy Fallback: Passed')
    } else {
        console.log('⚠️ Legacy Fallback: Changed (Strict mode?)', decryptedLegacy)
    }

    console.log('🎉 Encryption Verify Complete')
}

run()
