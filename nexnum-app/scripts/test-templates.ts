import 'dotenv/config'
import { EmailService } from '../src/lib/email'
import { ConfirmEmail } from '../src/components/emails/ConfirmEmail'
import { WelcomeEmail } from '../src/components/emails/WelcomeEmail'
import { PasswordResetEmail } from '../src/components/emails/PasswordResetEmail'

const TEST_EMAIL = 'flashsmsofficial@gmail.com' //process.env.SMTP_USER || 'test@example.com' //'udayscriptsx@gmail.com'

async function testConfirmEmail() {
    console.log(`\n📧 Sending ConfirmEmail to ${TEST_EMAIL}...`)
    return EmailService.send({
        to: TEST_EMAIL,
        subject: '[TEST] Confirm Your Email',
        component: ConfirmEmail({
            name: 'Harsh Thakur',
            confirmLink: 'http://localhost:3000/auth/verify?token=123xyz'
        })
    })
}

async function testWelcomeEmail() {
    console.log(`\n📧 Sending WelcomeEmail to ${TEST_EMAIL}...`)
    return EmailService.send({
        to: TEST_EMAIL,
        subject: 'Welcome to the NexNum Network', // Professional Subject
        component: WelcomeEmail({
            name: 'Harsh'
        })
    })
}

async function testPasswordReset() {
    console.log(`\n📧 Sending PasswordResetEmail to ${TEST_EMAIL}...`)
    return EmailService.send({
        to: TEST_EMAIL,
        subject: '[TEST] Reset Your Password',
        component: PasswordResetEmail({
            name: 'Harsh',
            resetLink: 'http://localhost:3000/auth/reset?token=abc789'
        })
    })
}

async function main() {
    const args = process.argv.slice(2).map(arg => arg.toLowerCase())

    const tests = {
        'confirm': testConfirmEmail,
        'welcome': testWelcomeEmail,
        'reset': testPasswordReset
    }

    const availableKeys = Object.keys(tests)
    const selectedKeys = args.length > 0 ? args.filter(k => availableKeys.includes(k)) : availableKeys

    if (args.length > 0 && selectedKeys.length === 0) {
        console.log('❌ No valid templates specified.')
        console.log(`Available options: ${availableKeys.join(', ')}`)
        return
    }

    console.log(`🧪 Testing Templates: ${selectedKeys.join(', ')}...`)

    let sentCount = 0
    for (const key of selectedKeys) {
        try {
            const func = tests[key as keyof typeof tests]
            const res = await func()
            if (res.success) {
                console.log('✅ Sent!')
                sentCount++
            } else {
                console.log(`❌ Failed: ${res.error}`)
            }
        } catch (error) {
            console.error(`❌ Error running ${key}:`, error)
        }
    }

    console.log(`\n✨ Done! Sent ${sentCount} email(s).`)
}

main().catch(console.error)
