
import crypto from 'crypto'

const key = crypto.randomBytes(32).toString('hex')
console.log('\n🔐 Generated Encryption Key (AES-256):\n')
console.log(key)
console.log('\n⚠️  Add this to your .env file as ENCRYPTION_KEY\n')
