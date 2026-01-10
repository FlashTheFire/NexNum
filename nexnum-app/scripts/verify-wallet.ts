
import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { WalletService } from '../src/lib/wallet'

async function main() {
    console.log('Verifying Wallet Service...')

    // Find a user with a wallet
    const user = await prisma.user.findFirst({
        include: { wallet: true }
    })

    if (!user || !user.wallet) {
        console.log('No user with wallet found. Creating dummy...')
        return
    }

    console.log(`Testing with User ID: ${user.id}`)
    console.log(`Raw Wallet Balance: ${user.wallet.balance}`)
    console.log(`Raw Wallet Reserved: ${user.wallet.reserved}`)

    // TEST CREDIT
    try {
        const initialBalance = await WalletService.getBalance(user.id)
        console.log(`Initial Balance: ${initialBalance}`)

        console.log('Testing WalletService.credit...')
        const amount = 10.00
        const result = await WalletService.credit(
            user.id,
            amount,
            'topup',
            'Test Verification Credit',
            `verify-${Date.now()}`
        )
        console.log(`Credit successful! Transaction ID: ${result.id}`)

        // Verify balance updated
        const newBalance = await WalletService.getBalance(user.id)
        console.log(`New Balance: ${newBalance}`)

        if (newBalance === initialBalance + amount) {
            console.log('✅ BALANCE UPDATED CORRECTLY')
        } else {
            console.error('❌ BALANCE MISMATCH')
        }

    } catch (error) {
        console.error('WalletService.credit failed:', error)
    }

    // TEST DEBIT
    try {
        const balanceAfterCredit = await WalletService.getBalance(user.id)
        console.log(`Balance before Debit: ${balanceAfterCredit}`)

        console.log('Testing WalletService.debit...')
        const debitAmount = 5.00
        const result = await WalletService.debit(
            user.id,
            debitAmount,
            'manual_debit',
            'Test Debit Deduction',
            `verify-debit-${Date.now()}`
        )
        console.log(`Debit successful! Transaction ID: ${result.id}`)

        const finalBalance = await WalletService.getBalance(user.id)
        console.log(`Final Balance: ${finalBalance}`)

        if (finalBalance === balanceAfterCredit - debitAmount) {
            console.log('✅ DEBIT DEDUCTED CORRECTLY')
        } else {
            console.error('❌ DEBIT MISMATCH')
        }

    } catch (error) {
        console.error('WalletService.debit failed:', error)
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
