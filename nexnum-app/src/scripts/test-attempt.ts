import 'dotenv/config'
import { prisma } from '../lib/core/db'

async function testVerificationAttempt() {
    console.log('🧪 Testing VerificationAttempt.create()...')
    const attempt = await prisma.verificationAttempt.create({
        data: {
            token: 'test_token_hash_123',
            ipAddress: '127.0.0.1',
            success: true
        }
    })

    console.log('✅ VerificationAttempt created with token_hash column:', attempt)

    await prisma.verificationAttempt.delete({ where: { id: attempt.id } })
    console.log('🎉 Cleaned up test attempt.')
}

testVerificationAttempt()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Error:', err)
        process.exit(1)
    })
