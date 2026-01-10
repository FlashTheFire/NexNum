
require('dotenv').config();
import { prisma } from './src/lib/db';
import { syncUserNumbers } from './src/lib/sms/sync';
import { WalletService } from './src/lib/wallet';

async function main() {
    console.log('--- Starting Refund Reproduction ---');

    // 1. Setup User & Wallet
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found');
    console.log(`User: ${user.email} (${user.id})`);

    let wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!wallet) {
        wallet = await prisma.wallet.create({
            data: { userId: user.id, balance: 0, reserved: 0 }
        });
    }
    const initialBalance = Number(wallet.balance);
    console.log(`Initial Balance: ${initialBalance}`);

    // 2. Create Mock Expired Number
    const mockNumber = await prisma.number.create({
        data: {
            phoneNumber: '1234567890',
            countryCode: 'US',
            countryName: 'United States',
            serviceCode: 'mock',
            serviceName: 'Mock Service',
            price: 1.5,
            status: 'active',
            ownerId: user.id,
            activationId: 'mock_activation_' + Date.now(),
            provider: 'mock',
            expiresAt: new Date(Date.now() - 1000 * 60) // Expired 1 min ago
        }
    });
    console.log(`Created Mock Number: ${mockNumber.id} (Expired)`);

    // 3. Run Sync (Simulate check-expiry)
    console.log('Running syncUserNumbers...');
    await syncUserNumbers(user.id, { numberIds: [mockNumber.id], force: true });

    // 4. Verify Refund
    const updatedWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    const finalBalance = Number(updatedWallet.balance);
    const updatedNumber = await prisma.number.findUniqueOrThrow({ where: { id: mockNumber.id } });

    console.log(`Final Balance: ${finalBalance}`);
    console.log(`Number Status: ${updatedNumber.status}`);

    if (finalBalance > initialBalance && updatedNumber.status === 'expired') {
        console.log('✅ Auto-Refund SUCCESS: Balance increased and status expired.');
    } else {
        console.log('❌ Auto-Refund FAILED:');
        if (finalBalance <= initialBalance) console.log('   - Balance did not increase');
        if (updatedNumber.status !== 'expired') console.log(`   - Status is ${updatedNumber.status}`);
    }

    // Cleanup
    await prisma.number.delete({ where: { id: mockNumber.id } });
    // await prisma.walletTransaction.deleteMany({ where: { description: { contains: 'Mock Service' } } }); // Optional
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
